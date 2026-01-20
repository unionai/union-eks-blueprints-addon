# Union EKS Blueprints Addon

Union addon for AWS EKS Blueprints CDK.

## Installation

```bash
npm install @unionai/union-eks-blueprints-addon
```

## Usage

```typescript
import * as cdk from 'aws-cdk-lib';
import * as blueprints from "@aws-quickstart/eks-blueprints"
import * as union from "@unionai/union-eks-blueprints-addon"

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
let props = { env: { account, region } };

const unionBlueprint = blueprints.AutomodeBuilder.builder({})
.resourceProvider('union-bucket', new blueprints.CreateS3BucketProvider({'my-union-bucket-123', 'union-bucket'})) // If you have an already existing bucket see @ImportS3BucketProvider
.addOns(
  new blueprints.addons.MetricsServerAddOn(),
  new union.UnionDataplaneCRDsAddOn,
  new union.UnionDataplaneAddOn({
    s3BucketProviderName: 'union-bucket',
    clusterName: "<YOUR_UNION_CLUSTER_NAME>",
    clientIdSecretName: "<YOUR_CLIENT_ID_SM_NAME>",
    clientSecretSecretName: "<YOUR_CLIENT_SECRET_SM_NAME>",
    host: "<YOUR_UNION_CONTROL_PLANE_HOST>",
    orgName: "<YOUR_ORG_NAME>"
  })
).build(app, "union-blueprint", props)
```

## License

Apache-2.0
