import { aws_codecommit, aws_ec2, StackProps, Stack } from 'aws-cdk-lib';
import { Bastion } from './constructs/ec2/bastion';
import { Construct } from 'constructs';
import { ServerlessApp } from './constructs/serverless/serverless-app';
import { CodePipelineWebappReact } from './constructs/codepipeline/codepipeline-webapp-react';
import { Network } from './constructs/network/network';
import { NagSuppressions } from 'cdk-nag';
import { DbInitLambda } from './constructs/aurora/dbinitlambda';

interface ServerlessappStackProps extends StackProps {
  auroraSecretName: string;
  auroraSecretArn: string;
  auroraSecurityGroupId: string;
  auroraSecretEncryptionKeyArn: string;
  auroraEdition: string;
  rdsProxyEndpoint: string;
  rdsProxyArn: string;
  containerRepositoryName: string;
  enabledPrivateLink: boolean;
  testVpcCidr: string;
  sourceRepositoryName: string;
  vpcId: string;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  certificateArn: string;
}

export class ServerlessappStack extends Stack {
  constructor(scope: Construct, id: string, props: ServerlessappStackProps) {
    super(scope, id, props);

    // Import vpc
    const vpc = aws_ec2.Vpc.fromLookup(this, 'WebappBaseVpc', {
      isDefault: false,
      vpcId: props.vpcId,
    });

    // Import repository
    const webappSourceRepository = aws_codecommit.Repository.fromRepositoryName(
      this,
      'WebappSourceRepository',
      props.sourceRepositoryName
    );

    let serverlessBase;
    if (props.enabledPrivateLink) {
      const privateLinkVpc = new Network(this, `PrivateLinkNetwork`, {
        cidr: '10.0.0.0/16',
        cidrMask: 24,
        publicSubnet: false,
        isolatedSubnet: true,
        maxAzs: 2,
      });
      serverlessBase = new ServerlessApp(this, `WebappBase`, {
        vpc: vpc,
        privateLinkVpc: privateLinkVpc.vpc,
        domainName: props.domainName,
        certificateArn: props.certificateArn,
        auroraSecretName: props.auroraSecretName,
        auroraSecretArn: props.auroraSecretArn,
        auroraSecurityGroupId: props.auroraSecurityGroupId,
        auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
        auroraEdition: props.auroraEdition,
        rdsProxyEndpoint: props.rdsProxyEndpoint,
        rdsProxyArn: props.rdsProxyArn,
      });
    } else {
      serverlessBase = new ServerlessApp(this, `WebappBase`, {
        vpc: vpc,
        domainName: props.domainName,
        certificateArn: props.certificateArn,
        auroraSecretName: props.auroraSecretName,
        auroraSecretArn: props.auroraSecretArn,
        auroraSecurityGroupId: props.auroraSecurityGroupId,
        auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
        auroraEdition: props.auroraEdition,
        rdsProxyEndpoint: props.rdsProxyEndpoint,
        rdsProxyArn: props.rdsProxyArn,
      });
    }

    // Create Deploy Pipeline
    new CodePipelineWebappReact(this, `WebappCodePipeline`, {
      codeCommitRepository: webappSourceRepository,
      s3bucket: serverlessBase.webappS3bucket,
    });

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
          auroraSecurityGroupId: props.auroraSecurityGroupId,
        });
        bastionSecurityGroup.addIngressRule(
          aws_ec2.Peer.ipv4(`${windowsBastion.bastionInstance.instancePrivateIp}/32`),
          aws_ec2.Port.tcp(443)
        );

        serverlessBase.alb.connections.allowFrom(
          windowsBastion.bastionInstance,
          aws_ec2.Port.tcp(443)
        );
      }

      if (props.linuxBastion) {
        const linuxBastion = new Bastion(this, `Linux`, {
          os: 'Linux',
          vpc: vpc,
          region: this.region,
          auroraSecurityGroupId: props.auroraSecurityGroupId,
        });
        bastionSecurityGroup.addIngressRule(
          aws_ec2.Peer.ipv4(`${linuxBastion.bastionInstance.instancePrivateIp}/32`),
          aws_ec2.Port.tcp(443)
        );

        serverlessBase.alb.connections.allowFrom(
          linuxBastion.bastionInstance,
          aws_ec2.Port.tcp(443)
        );
      }
    }

    new DbInitLambda(this, 'DBInitLambdaConstruct', {
      vpc: vpc,
      sgForLambda: serverlessBase.sgForLambda,
      auroraSecretName: props.auroraSecretName,
      auroraSecretArn: props.auroraSecretArn,
      auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
      rdsProxyEndpoint: props.rdsProxyEndpoint,
      rdsProxyArn: props.rdsProxyArn,
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
