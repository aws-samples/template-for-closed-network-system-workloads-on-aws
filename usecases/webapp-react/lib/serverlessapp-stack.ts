import { 
  aws_ec2, 
  aws_s3, 
  StackProps, 
  Stack, 
  aws_elasticloadbalancingv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ServerlessApp } from './construct/serverless/serverless-app';
import { NagSuppressions } from 'cdk-nag';
import { DbInitLambda } from './construct/aurora/dbinitlambda';
import { ApplicationLoadBalancer } from './construct/network/alb';

interface ServerlessappStackProps extends StackProps {
  dbSecretName: string;
  dbSecretArn: string;
  dbSecurityGroupId: string;
  dbSecretEncryptionKeyArn: string;
  dbEdition: string;
  dbProxyEndpoint: string;
  dbProxyArn: string;
  vpc: aws_ec2.Vpc;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  certificateArn: string;
  spaS3InterfaceEndpoint: aws_ec2.InterfaceVpcEndpoint;
  privateApiVpcEndpoint: aws_ec2.InterfaceVpcEndpoint;
  sgForApiGwVpce: aws_ec2.SecurityGroup;
  alb: ApplicationLoadBalancer;
  sgForAlb: aws_ec2.SecurityGroup;
}

export class ServerlessappStack extends Stack {
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly spaHostingBucket: aws_s3.Bucket;
  constructor(scope: Construct, id: string, props: ServerlessappStackProps) {
    super(scope, id, props);

    // Import vpc
    const vpc = props.vpc

    // Security Group for Lambda
    const sgForDb = aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'DbSecurityGroup',
      props.dbSecurityGroupId
    );

    // Create ServerlessApp (Application Resources Layer)
    const serverlessApp = new ServerlessApp(this, `ServerlessApp`, {
      vpc: vpc,
      domainName: props.domainName,
      certificateArn: props.certificateArn,
      dbSecretName: props.dbSecretName,
      dbSecretArn: props.dbSecretArn,
      dbSecurityGroupId: props.dbSecurityGroupId,
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      dbProxyEndpoint: props.dbProxyEndpoint,
      dbProxyArn: props.dbProxyArn,
      spaS3InterfaceEndpoint: props.spaS3InterfaceEndpoint,
      privateApiVpcEndpoint: props.privateApiVpcEndpoint,
      vpcEndpointSecurityGroup: props.sgForApiGwVpce
    });
    this.spaHostingBucket = serverlessApp.webappS3bucket;
    this.alb = props.alb.alb;

    // === Integration & Orchestration Layer ===
    
    // Security Group Rules
    if (props.dbEdition == 'mysql') {
      sgForDb.addIngressRule(serverlessApp.sgForLambda, aws_ec2.Port.tcp(3306));
    } else {
      sgForDb.addIngressRule(serverlessApp.sgForLambda, aws_ec2.Port.tcp(5432));
    }

    // Allow ALB to communicate with API Gateway VPC Endpoint
    serverlessApp.apiGw.vpcEndpointSecurityGroup.addIngressRule(props.sgForAlb, aws_ec2.Port.tcp(443));

    new DbInitLambda(this, 'DBInitLambdaConstruct', {
      vpc: vpc,
      sgForLambda: serverlessApp.sgForLambda,
      dbSecretName: props.dbSecretName,
      dbSecretArn: props.dbSecretArn,
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      dbProxyEndpoint: props.dbProxyEndpoint,
      dbProxyArn: props.dbProxyArn,
    });
  }
}
