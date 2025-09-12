import * as cdk from 'aws-cdk-lib';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { InfraopsConsoleStack } from '../lib/infraops-console-stack';
import parameter from '../parameter';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true, reports: true }));

const { deployEnv, sourceVpcId, appRunnerVpcEndpointId } = parameter;

// インフラオペレーションコンソールスタックの作成
const infraopsConsoleStack = new InfraopsConsoleStack(app, `${deployEnv}InfraopsConsole`, {
  env,
  description: 'InfraopsConsoleStack will provision DynamoDB table and AppRunner service for infraops console (uksb-1tupboc54) (tag:infraops-console).',
  sourceVpcId,
  appRunnerVpcEndpointId
});

/**
 * CDK NAG Suppressions
 */
NagSuppressions.addStackSuppressions(infraopsConsoleStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason: 'To use ManagedPolicy',
  },
]);
