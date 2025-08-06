import * as cdk from 'aws-cdk-lib';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';
import { WebappStack } from '../lib/webapp-stack';
import { CicdStack } from '../lib/cicd-stack';
import { BatchStack } from '../lib/batch-stack';
import parameter from '../parameter';
// Please do npm run create:certificate before cdk deploy
import { CertificateArn } from '../config/certificate_arn.json'

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true, reports: true }));

const deployEnv = parameter.deployEnv;
const accessViaPrivateLink = parameter.accessViaPrivateLink;
const windowsBastion = parameter.windowsBastion;
const linuxBastion = parameter.linuxBastion;
const domainName = parameter.domainName;
const certificateArn = CertificateArn;

const networkStack = new NetworkStack(app, `${deployEnv}Network`, {
  env,
  description: 'NetworkStack will provision vpc (uksb-1tupboc54) (tag:network).',
});

const storageStack = new StorageStack(app, `${deployEnv}Storage`, {
  env,
  description: 'NetworkStack will provision vpc (uksb-1tupboc54) (tag:storage).',
  vpc: networkStack.vpc
})

const webappStack = new WebappStack(app, `${deployEnv}Webapp`, {
  env,
  description:
    'WebappStack will provision ecs cluster for webapp, load balancers, bastions (uksb-1tupboc54) (tag:webapp-container).',
  dbCluster: storageStack.dbCluster,
  dbSecretName: storageStack.dbCluster.secret!.secretName,
  dbSecretEncryptionKeyArn: storageStack.dbEncryptionKeyArn,
  vpc: networkStack.vpc,
  accessViaPrivateLink,
  windowsBastion,
  linuxBastion,
  domainName,
  certificateArn,
});

const cicdStack = new CicdStack(app, `${deployEnv}CICD`, {
  env,
  description: 'CicdStack will provision CI/CD Pipeline (uksb-1tupboc54) (tag:cicd).',
  ecsService: webappStack.ecsService,
  containerName: webappStack.containerName
})

new BatchStack(app, `${deployEnv}Batch`, {
  env,
  description: 'BatchStack will provision sfn workflow (uksb-1tupboc54) (tag:batch).',
  notifyEmail: parameter.notifyEmail,
  repositoryName: cicdStack.batchRepository.repositoryName,
  vpc: networkStack.vpc,
  dbSecretName: storageStack.dbCluster.secret!.secretName,
  dbSecurityGroupId: storageStack.dbCluster.connections.securityGroups[0].securityGroupId,
  dbSecretEncryptionKeyArn: storageStack.dbEncryptionKeyArn,
})

/**
 * CDK NAG Suppressions
 */
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
