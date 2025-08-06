import * as cdk from 'aws-cdk-lib';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';
import { ServerlessappStack } from '../lib/serverlessapp-stack';
import { CicdStack } from '../lib/cicd-stack';
import parameter from '../parameter';
import { CertificateArn } from '../config/certificate_arn.json';

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
  s3InterfaceEndpoint: networkStack.s3InterfaceEndpoint
});

const cicdStack = new CicdStack(app, `${deployEnv}CICD`, {
  env,
  description: 'CicdStack will provision CI/CD Pipeline (uksb-1tupboc54) (tag:cicd).',
  s3Bucket: serverlessappStack.spaHostingBucket
})

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
