import { capitalize } from 'lodash';
import * as cdk from 'aws-cdk-lib';
import { ServerlessappStack } from '../lib/serverlessapp-stack';
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
const enabledPrivateLink = app.node.tryGetContext('enabled_privatelink') || false;
const vpcId = app.node.tryGetContext('app_vpc_id') || 'defaultVpc';
const windowsBastion = app.node.tryGetContext('windows_bastion') || false;
const linuxBastion = app.node.tryGetContext('linux_bastion') || false;
const domainName = app.node.tryGetContext('domain_name') || 'defaultDomain';
const certificateArn = app.node.tryGetContext('certificate_arn') || 'defaultCert';

const auroraSecretName = cdk.Fn.importValue('SecretName');
const auroraSecretArn = cdk.Fn.importValue('SecretArn');
const auroraSecurityGroupId = cdk.Fn.importValue('AuroraSecurityGroupId');
const auroraSecretEncryptionKeyArn = cdk.Fn.importValue('AuroraSecretEncryptionKeyArn');
const auroraEdition = cdk.Fn.importValue('AuroraEdition');
const rdsProxyEndpoint = cdk.Fn.importValue('RdsProxyEndpoint');
const rdsProxyArn = cdk.Fn.importValue('RdsProxyArn');
const containerRepositoryName = cdk.Fn.importValue('WebappContainerRepositoryName');
const sourceRepositoryName = cdk.Fn.importValue('WebappSourceRepositoryName');


const qualifier = `${stageAlias.slice(0, 5)}${deployEnv.slice(0, 5)}`;

const id = `${capitalize(stageAlias)}${capitalize(deployEnv)}${capitalize(appName)}`;
const webappStack = new ServerlessappStack(app, `${id}Webapp`, {
    env:env,
    synthesizer: new DefaultStackSynthesizer({
        qualifier,
    }),
    auroraSecretName,
    auroraSecretArn,
    auroraSecurityGroupId,
    auroraSecretEncryptionKeyArn,
    auroraEdition,
    rdsProxyEndpoint,
    rdsProxyArn,
    containerRepositoryName,
    enabledPrivateLink: enabledPrivateLink.toLowerCase() === 'true',
    testVpcCidr: '10.2.0.0/16',
    sourceRepositoryName,
    vpcId,
    windowsBastion,
    linuxBastion,
    domainName,
    certificateArn,
});
// cdk-nag suppressions
NagSuppressions.addStackSuppressions(webappStack, [
{
    id: 'AwsSolutions-IAM5',
    reason: 'To use ManagedPolicy',
},
]);