import * as cdk from 'aws-cdk-lib';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';
import { ServerlessappStack } from '../lib/serverlessapp-stack';
import { CicdStack } from '../lib/cicd-stack';
import parameter from '../parameter';
import { CertificateArn } from '../config/certificate_arn.json';
import { SharedNetworkStack } from '../lib/shared-network-stack';
import { BatchStack } from '../lib/batch-stack';
import { DomainStack } from '../lib/domain-stack';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true, reports: true }));

const deployEnv = parameter.deployEnv;
const sharedVpcCidr = parameter.sharedVpcCidr;
const appVpcCidr = parameter.appVpcCidr;
const windowsBastion = parameter.windowsBastion;
const linuxBastion = parameter.linuxBastion;
const domainName = parameter.domainName;
const certificateArn = CertificateArn;

const sharedNetworkStack = new SharedNetworkStack(app, `${deployEnv}SharedNetwork`, {
  env,
  description: 'SharedNetworkStack will provision vpc and tgw (uksb-1tupboc54) (tag:shared-network).',
  sharedVpcCidr,
  destinationVpcCidrs: [appVpcCidr],
  windowsBastion,
  linuxBastion,
});

const appNetworkStack = new NetworkStack(app, `${deployEnv}AppNetwork`, {
  env,
  description: 'NetworkStack will provision vpc (uksb-1tupboc54) (tag:app-network).',
  vpcCidr: appVpcCidr,
  tgw: sharedNetworkStack.tgw,
  sharedVpcCidr,
  resolverInboundEndpointIps: sharedNetworkStack.endpointIps
});

const storageStack = new StorageStack(app, `${deployEnv}Storage`, {
  env,
  description: 'NetworkStack will provision vpc (uksb-1tupboc54) (tag:storage).',
  vpc: appNetworkStack.vpc,
  sharedNetworkStackName: sharedNetworkStack.node.id,
  windowsBastion: windowsBastion, 
  linuxBastion: linuxBastion
});

const serverlessappStack = new ServerlessappStack(app, `${deployEnv}Serverless`, {
  env: env,
  description:
    'ServerlessappStack will provision APIGateway, lambda for webapp, load balancers, bastions (uksb-1tupboc54) (tag:serverless).',
  dbSecretName: storageStack.dbCluster.secret!.secretName,
  dbSecretArn: storageStack.dbCluster.secret!.secretArn,
  dbSecurityGroupId: storageStack.dbCluster.connections.securityGroups[0].securityGroupId,
  dbSecretEncryptionKeyArn: storageStack.dbEncryptionKeyArn,
  dbEdition: 'postgresql',
  dbProxyEndpoint: storageStack.dbProxy.endpoint,
  dbProxyArn: storageStack.dbProxy.dbProxyArn,
  accessViaPrivateLink,
  vpc: networkStack.vpc,
  windowsBastion,
  linuxBastion,
  domainName,
  certificateArn,
  s3InterfaceEndpoint: sharedNetworkStack.s3InterfaceEndpoint
});

const cicdStack = new CicdStack(app, `${deployEnv}CICD`, {
  env,
  description: 'CicdStack will provision CI/CD Pipeline (uksb-1tupboc54) (tag:cicd).',
  s3Bucket: serverlessappStack.spaHostingBucket
})

new BatchStack(app, `${deployEnv}Batch`, {
  env,
  description: 'BatchStack will provision sfn workflow (uksb-1tupboc54) (tag:batch).',
  notifyEmail: parameter.notifyEmail,
  repositoryName: cicdStack.batchRepository.repositoryName,
  vpc: appNetworkStack.vpc,
  dbSecretName: storageStack.dbCluster.secret!.secretName,
  dbSecurityGroupId: storageStack.dbCluster.connections.securityGroups[0].securityGroupId,
  dbSecretEncryptionKeyArn: storageStack.dbEncryptionKeyArn,
});

new DomainStack(app, `${deployEnv}Domain`, {
  env,
  description: 'DomainStack will provision Private Hosted Zone and ARecords of each workload (uksb-1tupboc54) (tag:domain).',
  sharedVpc: sharedNetworkStack.network.vpc,
  tgw: sharedNetworkStack.tgw,
  domainName,
  recordItems: [{
    name: `app.${parameter.domainName}`,
    target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.LoadBalancerTarget(webappStack.alb))
  }],
  resolverInboundEndpointIps: sharedNetworkStack.endpointIps
});

/**
 * CDK NAG Suppressions
 */
// NagSuppressions.addStackSuppressions(base, [
//   {
//     id: 'CdkNagValidationFailure',
//     reason: 'refer to https://github.com/cdklabs/cdk-nag/issues/817',
//   },
// ]);

NagSuppressions.addStackSuppressions(serverlessappStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason: 'To use ManagedPolicy',
  },
]);

NagSuppressions.addStackSuppressions(cicdStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason: 'To use ManagedPolicy',
  },
]);
