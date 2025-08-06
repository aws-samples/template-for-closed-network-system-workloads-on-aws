import { aws_ec2, custom_resources, CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { DefaultLambda } from '../serverless/lambda';
import * as path from 'path';

export class DbInitLambda extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: aws_ec2.IVpc;
      sgForLambda: aws_ec2.SecurityGroup;
      dbSecretName: string;
      dbSecretArn: string;
      dbSecretEncryptionKeyArn: string;
      dbProxyEndpoint: string;
      dbProxyArn: string;
    }
  ) {
    super(scope, id);

    const initLambda = new DefaultLambda(this, 'dbInitLambda', {
      entry: path.join(__dirname, '../../../functions/init.ts'),
      vpc: props.vpc,
      dbSecretName: props.dbSecretName,
      dbSecretArn: props.dbSecretArn,
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      dbProxyEndpoint: props.dbProxyEndpoint,
      dbProxyArn: props.dbProxyArn,
      sgForLambda: props.sgForLambda,
    });

    const provider = new custom_resources.Provider(this, 'DBInitProvider', {
      onEventHandler: initLambda.lambda,
    });

    new CustomResource(this, 'DBInitResource', {
      serviceToken: provider.serviceToken,
      properties: {
        time: Date.now().toString(),
      },
    });
    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],
      true
    );
  }
}
