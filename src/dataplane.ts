import { Construct } from "constructs";
import * as blueprints from "@aws-quickstart/eks-blueprints"
import { IBucket } from "aws-cdk-lib/aws-s3";
import { UnionDataplaneCRDsAddOn } from "./dataplane-crds";
import { UnionIAMPolicy } from "./iam-policy";
import { CfnJson } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { merge } from "ts-deepmerge";

export interface UnionDataplaneAddOnProps extends blueprints.HelmAddOnUserProps {
  /*
   * Your Union control plane URL (should not include the "http://")
   */
  readonly host: string;

  /*
   * Name of your Union.ai organization
   */
  readonly orgName: string;

  /*
   * Name of the cluster registered with Union.ai
   */
  readonly clusterName: string;

  /*
   * Union S3 Bucket provider name - @see CreateS3BucketProvider
   */
  readonly s3BucketProviderName: string;

  /*
   * Name of combined Union Client ID and Client Secret Secret in Secrets Manager
   */
  readonly unionSecretName: string

  /*
   * CDK Creates the Namespace for you
   */
  readonly createNamespace?: boolean;
}

const defaultProps: blueprints.HelmAddOnProps & Partial<UnionDataplaneAddOnProps> = {
  name: "unionai-dataplane",
  chart: "dataplane",
  release: "blueprints-addon-union-dataplane",
  version: "2026.1.5",
  repository: "https://unionai.github.io/helm-charts",
  namespace: "unionai",
  createNamespace: true,
  values: {}
};


export class UnionDataplaneAddOn extends blueprints.HelmAddOn {

  readonly options: UnionDataplaneAddOnProps;

  constructor(props: UnionDataplaneAddOnProps) {
    super({ ...defaultProps, ...props });
    this.options = this.props as UnionDataplaneAddOnProps;
  }

  @blueprints.utils.dependable(UnionDataplaneCRDsAddOn.name)
  async deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const bucket = clusterInfo.getRequiredResource<IBucket>(this.options.s3BucketProviderName!);

    const unionPolicyDocument = iam.PolicyDocument.fromJson(UnionIAMPolicy(bucket.bucketName));

    const unionPolicy = new iam.ManagedPolicy(clusterInfo.cluster, "UnionDataplanePolicy", { document: unionPolicyDocument });

    const conditions = new CfnJson(clusterInfo.cluster, 'ConditionJson', {
      value: {
        [`${clusterInfo.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
        [`${clusterInfo.cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:*`,
      },
    });
    const principal = new iam.OpenIdConnectPrincipal(clusterInfo.cluster.openIdConnectProvider).withConditions({
      StringLike: conditions,
    });
    const unionRole = new iam.Role(clusterInfo.cluster, 'union-user-role', { assumedBy: principal });
    unionRole.addManagedPolicy(unionPolicy);

    let values = await populateValues(this.options, clusterInfo, clusterInfo.cluster.stack.region, bucket, unionRole.roleArn);
    values = merge(values, this.options.values ?? {});
    const chart = this.addHelmChart(clusterInfo, values, this.options.createNamespace);

    return Promise.resolve(chart);
  }

}

function getJsonSecret(secretString: string, key?: string): string {
  const parsed = JSON.parse(secretString);
  return key ? parsed[key] : parsed;
}

/**
* populateValues populates the appropriate values used to customize the Helm chart
* @param options User provided values to customize the chart
* @param clusterName Name of the EKS cluster
* @param region Region of the stack
*/
async function populateValues(options: UnionDataplaneAddOnProps, clusterInfo: blueprints.ClusterInfo, region: string, bucket: IBucket, roleArn: string): Promise<blueprints.Values> {
  const unionSecretString = await blueprints.utils.getSecretValue(options.unionSecretName, region);

  const clientId = getJsonSecret(unionSecretString, "clientId");
  const clientSecret = getJsonSecret(unionSecretString, "clientSecret");

  return {
    global: {
      UNION_CONTROL_PLANE_HOST: options.host,
      CLUSTER_NAME: options.clusterName,
      ORG_NAME: options.orgName,
      CLIENT_ID: clientId,
      METADATA_BUCKET: bucket.bucketName,
      FAST_REGISTRATION_BUCKET: bucket.bucketName,
      AWS_REGION: region,
      BACKEND_IAM_ROLE_ARN: roleArn,
      WORKER_IAM_ROLE_ARN: roleArn
    },
    provider: "aws",
    storage: {
      provider: "aws",
      authType: "iam",
      region: '{{ .Values.global.AWS_REGION }}',
      enableMultiContainer: true
    },
    secrets: {
      admin: {
        create: true,
        clientId: '{{ .Values.global.CLIENT_ID }}',
        clientSecret
      }
    },
    prometheus: {
      namespaceOverride: options.namespace!
    },
    additionalServiceAccountAnnotations: {
      "eks.amazonaws.com/role-arn": "{{ tpl .Values.global.BACKEND_IAM_ROLE_ARN . }}"
    },
    userRoleAnnotationKey: "eks.amazonaws.com/role-arn",
    userRoleAnnotationValue: "{{ tpl .Values.global.WORKER_IAM_ROLE_ARN . }}",
    fluentbit: {
      serviceAccount: {
        annotations: {
          "eks.amazonaws.com/role-arn": roleArn
        }
      }
    }
  };
}

