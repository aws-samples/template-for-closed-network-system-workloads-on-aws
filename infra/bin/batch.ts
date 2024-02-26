import { capitalize } from 'lodash';
import * as cdk from 'aws-cdk-lib';

import { BatchStack } from '../lib/batch-stack';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();
// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true, reports: true }));

const stageAlias = app.node.tryGetContext('stage_alias') || 'defaultAlias';
const appName = app.node.tryGetContext('app_name') || 'defaultApp';
const deployEnv = app.node.tryGetContext('deploy_env') || 'defaultEnv';
const notifyEmail = app.node.tryGetContext('notify_email');
const appVpcId = app.node.tryGetContext('app_vpc_id') || 'defaultVpc';

if (!notifyEmail) {
  throw new Error('No notify email address in stages.js');
}

const repositoryName = cdk.Fn.importValue('BatchContainerRepositoryName');
const auroraSecretName = cdk.Fn.importValue('SecretName');
const auroraSecurityGroupId = cdk.Fn.importValue('AuroraSecurityGroupId');
const auroraSecretEncryptionKeyArn = cdk.Fn.importValue('AuroraSecretEncryptionKeyArn');

const qualifier = `${stageAlias.slice(0, 5)}${deployEnv.slice(0, 5)}`;

const id = `${capitalize(stageAlias)}${capitalize(deployEnv)}${capitalize(appName)}`;

new BatchStack(app, `${id}Batch`, {
  env,
  synthesizer: new DefaultStackSynthesizer({
    qualifier,
  }),
  description:
    'BatchStack will provision stepfunctions statemachine and ecs cluster for batch (uksb-1tupboc54).',
  notifyEmail,
  repositoryName,
  vpcId: appVpcId,
  auroraSecretName,
  auroraSecurityGroupId,
  auroraSecretEncryptionKeyArn,
});
