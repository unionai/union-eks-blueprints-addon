import { Construct } from "constructs";
import * as blueprints from "@aws-quickstart/eks-blueprints";

const defaultProps: blueprints.HelmAddOnProps = {
  name: "unionai-dataplane-crds",
  chart: "dataplane-crds",
  release: "blueprints-addon-union-dataplane-crds",
  version: "2026.1.1",
  repository: "https://unionai.github.io/helm-charts",
  namespace: "default",
  values: {}
};

export class UnionDataplaneCRDsAddOn extends blueprints.HelmAddOn {

  constructor(props?: blueprints.HelmAddOnUserProps) {
    super({ ...defaultProps, ...props });
  }

  deploy(clusterInfo: blueprints.ClusterInfo): void | Promise<Construct> {
    const chart = this.addHelmChart(clusterInfo, {}, false);
    return Promise.resolve(chart);
  }

}
