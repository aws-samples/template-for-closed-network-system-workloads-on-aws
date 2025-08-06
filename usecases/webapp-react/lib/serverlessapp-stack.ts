import { aws_ec2, aws_s3, StackProps, Stack } from 'aws-cdk-lib';
import { Bastion } from './construct/ec2/bastion';
import { Construct } from 'constructs';
import { ServerlessApp } from './construct/serverless/serverless-app';
import { Network } from './construct/network/network';
import { NagSuppressions } from 'cdk-nag';
import { DbInitLambda } from './construct/aurora/dbinitlambda';

interface ServerlessappStackProps extends StackProps {
  dbSecretName: string;
  dbSecretArn: string;
  dbSecurityGroupId: string;
  dbSecretEncryptionKeyArn: string;
  dbEdition: string;
  dbProxyEndpoint: string;
  dbProxyArn: string;
  accessViaPrivateLink: boolean;
  vpc: aws_ec2.Vpc;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  certificateArn: string;
  s3InterfaceEndpoint: aws_ec2.InterfaceVpcEndpoint;
}

export class ServerlessappStack extends Stack {
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
    const sgForLambda = new aws_ec2.SecurityGroup(this, 'ApiGwSecurityGroup', {
      vpc: vpc,
      allowAllOutbound: true,
    });
    if (props.dbEdition == 'mysql') {
      sgForDb.addIngressRule(sgForLambda, aws_ec2.Port.tcp(3306));
    } else {
      sgForDb.addIngressRule(sgForLambda, aws_ec2.Port.tcp(5432));
    }

    let serverlessApp;
    if (props.accessViaPrivateLink) {
      const privateLinkVpc = new Network(this, `PrivateLinkNetwork`, {
        cidr: '10.0.0.0/16',
        cidrMask: 24,
        publicSubnet: false,
        isolatedSubnet: true,
        maxAzs: 2,
      });
      serverlessApp = new ServerlessApp(this, `ServerlessApp`, {
        vpc: vpc,
        privateLinkVpc: privateLinkVpc.vpc,
        domainName: props.domainName,
        certificateArn: props.certificateArn,
        dbSecretName: props.dbSecretName,
        dbSecretArn: props.dbSecretArn,
        dbSecurityGroupId: props.dbSecurityGroupId,
        dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
        dbProxyEndpoint: props.dbProxyEndpoint,
        dbProxyArn: props.dbProxyArn,
        sgForLambda: sgForLambda,
        s3InterfaceEndpoint: props.s3InterfaceEndpoint,
      });
    } else {
      serverlessApp = new ServerlessApp(this, `ServerlessApp`, {
        vpc: vpc,
        domainName: props.domainName,
        certificateArn: props.certificateArn,
        dbSecretName: props.dbSecretName,
        dbSecretArn: props.dbSecretArn,
        dbSecurityGroupId: props.dbSecurityGroupId,
        dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
        dbProxyEndpoint: props.dbProxyEndpoint,
        dbProxyArn: props.dbProxyArn,
        sgForLambda: sgForLambda,
        s3InterfaceEndpoint: props.s3InterfaceEndpoint,
      });
    }
    this.spaHostingBucket = serverlessApp.webappS3bucket;

    if (props.windowsBastion || props.linuxBastion) {
      const bastionSecurityGroup = new aws_ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc,
      });
      vpc.addInterfaceEndpoint('BastionSsmVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });

      vpc.addInterfaceEndpoint('BastionSsmMessagesVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });

      vpc.addInterfaceEndpoint('BastionEc2MessagesVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });
      // S3's vpc endpoint for yum repo has already been attached in serverless-app-base construct

      if (props.windowsBastion) {
        const windowsBastion = new Bastion(this, `Windows`, {
          os: 'Windows',
          vpc: vpc,
          region: this.region,
          auroraSecurityGroupId: props.dbSecurityGroupId,
        });
        bastionSecurityGroup.addIngressRule(
          aws_ec2.Peer.ipv4(`${windowsBastion.bastionInstance.instancePrivateIp}/32`),
          aws_ec2.Port.tcp(443)
        );

        serverlessApp.alb.connections.allowFrom(
          windowsBastion.bastionInstance,
          aws_ec2.Port.tcp(443)
        );
      }

      if (props.linuxBastion) {
        const linuxBastion = new Bastion(this, `Linux`, {
          os: 'Linux',
          vpc: vpc,
          region: this.region,
          auroraSecurityGroupId: props.dbSecurityGroupId,
        });
        bastionSecurityGroup.addIngressRule(
          aws_ec2.Peer.ipv4(`${linuxBastion.bastionInstance.instancePrivateIp}/32`),
          aws_ec2.Port.tcp(443)
        );

        serverlessApp.alb.connections.allowFrom(
          linuxBastion.bastionInstance,
          aws_ec2.Port.tcp(443)
        );
      }
    }

    new DbInitLambda(this, 'DBInitLambdaConstruct', {
      vpc: vpc,
      sgForLambda: sgForLambda,
      dbSecretName: props.dbSecretName,
      dbSecretArn: props.dbSecretArn,
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      dbProxyEndpoint: props.dbProxyEndpoint,
      dbProxyArn: props.dbProxyArn,
    });

    // [CHANGE HERE] Nag suppressions with path : you need to change here for deployment...
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${id}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK managed resource',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
      ]
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${id}/AWS679f53fac002430cb0da5b7982bd2287/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'CDK managed resource',
        },
      ]
    );
  }
}
