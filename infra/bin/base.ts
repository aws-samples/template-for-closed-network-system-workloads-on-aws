import { capitalize } from 'lodash';
import * as cdk from 'aws-cdk-lib';

import { BaseStack } from '../lib/base-stack';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
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

const qualifier = `${stageAlias.slice(0, 5)}${deployEnv.slice(0, 5)}`;

const id = `${capitalize(stageAlias)}${capitalize(deployEnv)}${capitalize(appName)}`;

const base = new BaseStack(app, `${id}Base`, {
  env,
  synthesizer: new DefaultStackSynthesizer({
    qualifier,
  }),
  description:
    'BaseStack will provision static resourcse, like a database, repository, and vpc (uksb-1tupboc54) (tag:base).',
});

// cdk-nag suppressions
NagSuppressions.addStackSuppressions(base, [
  {
    id: 'CdkNagValidationFailure',
    reason: 'refer to https://github.com/cdklabs/cdk-nag/issues/817',
  },
]);
