import { aws_ec2,custom_resources,CustomResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { DefaultLambda } from "./lambda";
import * as path from 'path';

export class DBinitLambda extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: {
            vpc: aws_ec2.IVpc;
            sgForLambda:aws_ec2.SecurityGroup;
            auroraSecretName: string;
            auroraSecretArn: string;
            auroraSecretEncryptionKeyArn: string;
            rdsProxyEndpoint:string;
            rdsProxyArn:string;
        }
    ) {
        super(scope,id);
        
        const initFunc = new DefaultLambda(this,'DbInitLambdaConstruct',{
            resourceId:'DbInitLambda',
            entry:path.join(__dirname, '../../../../functions/init.ts'),
            vpc: props.vpc,
            auroraSecretName: props.auroraSecretName,
            auroraSecretArn: props.auroraSecretArn,
            auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
            rdsProxyEndpoint:props.rdsProxyEndpoint,
            rdsProxyArn:props.rdsProxyArn,
            sgForLambda:props.sgForLambda,
        })
        const provider = new custom_resources.Provider(
          this, 'DBInitProvider',{
            onEventHandler:initFunc.lambda,
          }
      )
    
      new CustomResource(
          this, 'DBInitResource',{
           serviceToken:provider.serviceToken,
           properties:{
              time:Date.now().toString()
           }
          }
      )
      NagSuppressions.addResourceSuppressions(provider, [
        {
          id: 'AwsSolutions-L1',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(provider, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],true);
      NagSuppressions.addResourceSuppressions(provider, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is Custom Resource managed by AWS',
        },
      ],true);
    }
}