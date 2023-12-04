import { aws_codecommit, aws_ec2, aws_ecr, StackProps, Stack } from 'aws-cdk-lib';
import { Bastion } from './constructs/ec2/bastion';
import { Construct } from 'constructs';
import { EcsAppBase } from './constructs/ecs/ecs-app-base';
import { EcsAppService } from './constructs/ecs/ecs-app-service';
import { CodePipeline } from './constructs/codepipeline/codepipeline-webapp-java';
import { Network } from './constructs/network/network';

interface WebappStackProps extends StackProps {
  auroraSecretName: string;
  auroraSecurityGroupId: string;
  auroraSecretEncryptionKeyArn: string;
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

export class WebappStack extends Stack {
  constructor(scope: Construct, id: string, props: WebappStackProps) {
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
    const webappContainerRepository = aws_ecr.Repository.fromRepositoryName(
      this,
      'WebappContainerRepository',
      props.containerRepositoryName
    );

    let ecsBase;
    if (props.enabledPrivateLink) {
      const privateLinkVpc = new Network(this, `PrivateLinkNetwork`, {
        cidr: '10.0.0.0/16',
        cidrMask: 24,
        publicSubnet: false,
        isolatedSubnet: true,
        maxAzs: 2,
      });
      // Create ECS
      ecsBase = new EcsAppBase(this, `WebappBase`, {
        vpc: vpc,
        privateLinkVpc: privateLinkVpc.vpc,
        domainName: 'templateapp.local',
        certificateArn: props.certificateArn,
      });
    } else {
      // Create ECS
      ecsBase = new EcsAppBase(this, `WebappBase`, {
        vpc: vpc,
        domainName: 'templateapp.local',
        certificateArn: props.certificateArn,
      });
    }

    const ecsAppService = new EcsAppService(this, `WebappService`, {
      auroraSecretName: props.auroraSecretName,
      auroraSecurityGroupId: props.auroraSecurityGroupId,
      auroraSecretEncryptionKeyArn: props.auroraSecretEncryptionKeyArn,
      cluster: ecsBase.cluster,
      repository: webappContainerRepository,
      targetGroup: ecsBase.targetGroup,
      httpsTargetGroup: ecsBase.httpsTargetGroup,
    });

    // Create Deploy Pipeline
    new CodePipeline(this, `WebappCodePipeline`, {
      codeCommitRepository: webappSourceRepository,
      ecrRepository: webappContainerRepository,
      ecsService: ecsAppService.ecsService,
      containerName: ecsAppService.ecsContainer.containerName,
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
      // S3's vpc endpoint for yum repo has already been attached in ecs-app-base construct

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

        ecsBase.alb.connections.allowFrom(windowsBastion.bastionInstance, aws_ec2.Port.tcp(443));
        ecsAppService.ecsService.connections.allowFrom(
          windowsBastion.bastionInstance,
          aws_ec2.Port.tcp(8443)
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

        ecsBase.alb.connections.allowFrom(linuxBastion.bastionInstance, aws_ec2.Port.tcp(443));
        ecsAppService.ecsService.connections.allowFrom(
          linuxBastion.bastionInstance,
          aws_ec2.Port.tcp(8443)
        );
      }
    }
  }
}
