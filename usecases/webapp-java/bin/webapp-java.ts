import * as cdk from 'aws-cdk-lib';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Aspects, aws_route53, aws_route53_targets } from 'aws-cdk-lib';
import { SharedNetworkStack } from '../lib/shared-network-stack';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';
import { WebappStack } from '../lib/webapp-stack';
import { CicdStack } from '../lib/cicd-stack';
import { BatchStack } from '../lib/batch-stack';
import parameter from '../parameter';
// Please do npm run create:certificate before cdk deploy
import { CertificateArn } from '../config/certificate_arn.json'
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
const filePathOfSourceArtifact = parameter.filePathOfSourceArtifact;
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
})

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
})

const webappStack = new WebappStack(app, `${deployEnv}Webapp`, {
  env,
  description:
    'WebappStack will provision ecs cluster for webapp, load balancers, bastions (uksb-1tupboc54) (tag:webapp-container).',
  dbCluster: storageStack.dbCluster,
  dbSecretName: storageStack.dbCluster.secret!.secretName,
  dbSecretEncryptionKeyArn: storageStack.dbEncryptionKeyArn,
  vpc: appNetworkStack.vpc,
  sharedVpc: sharedNetworkStack.network.vpc,
  tgw: sharedNetworkStack.tgw,
  domainName,
  certificateArn,
});
 
const cicdStack = new CicdStack(app, `${deployEnv}CICD`, {
  env,
  description: 'CicdStack will provision CI/CD Pipeline (uksb-1tupboc54) (tag:cicd).',
  ecsService: webappStack.ecsService,
  containerName: webappStack.containerName,
  filePathOfSourceArtifact: filePathOfSourceArtifact
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
})

new DomainStack(app, `${deployEnv}Domain`, {
  env,
  description: 'DomainStack will provision Private Hosted Zone and ARecords of each workload (uksb-1tupboc54) (tag:domain).',
  sharedVpc: sharedNetworkStack.network.vpc,
  tgw: sharedNetworkStack.tgw,
  domainName,
  recordItems: [{
    name: `app.${parameter.domainName}`,
    target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(webappStack.alb))
  }],
  resolverInboundEndpointIps: sharedNetworkStack.endpointIps
})

/**
 * CDK NAG Suppressions
 */
NagSuppressions.addStackSuppressions(sharedNetworkStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason: 'To use ManagedPolicy',
  },
]);

NagSuppressions.addStackSuppressions(webappStack, [
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
