import { aws_ec2, aws_ecs, aws_iam, aws_rds, StackProps, Stack, aws_secretsmanager, aws_kms } from 'aws-cdk-lib';
import { Bastion } from './construct/ec2/bastion';
import { Construct } from 'constructs';
import { EcsAppBase } from './construct/ecs/ecs-app-base';
import { EcsAppService } from './construct/ecs/ecs-app-service';

interface WebappStackProps extends StackProps {
  dbCluster: aws_rds.DatabaseCluster | aws_rds.ServerlessCluster;
  dbSecretName: string;
  dbSecretEncryptionKeyArn: string;
  accessViaPrivateLink: boolean;
  vpc: aws_ec2.Vpc;
  windowsBastion: boolean;
  linuxBastion: boolean;
  domainName: string;
  certificateArn: string;
}

export class WebappStack extends Stack {
  public readonly ecsService: aws_ecs.FargateService;
  public readonly containerName: string;
  constructor(scope: Construct, id: string, props: WebappStackProps) {
    super(scope, id, props);

    const auroraSG = props.dbCluster.connections.securityGroups[0];

    // Create ECS
    const ecsBase = new EcsAppBase(this, `WebappBase`, {
      vpc: props.vpc,
      domainName: props.domainName,
      certificateArn: props.certificateArn,
      accessViaPrivateLink: props.accessViaPrivateLink
    });

    const ecsAppService = new EcsAppService(this, `WebappService`, {
      cluster: ecsBase.cluster,
      targetGroup: ecsBase.targetGroup,
      httpsTargetGroup: ecsBase.httpsTargetGroup,
    });
    this.ecsService = ecsAppService.ecsService;
    this.containerName = ecsAppService.ecsContainer.containerName;

    // To avoid cyclic dependency
    const dbSecret = aws_secretsmanager.Secret.fromSecretNameV2(this, 'DbSecret', props.dbSecretName)
    const dbSecretEncryptionKey = aws_kms.Key.fromKeyArn(this, 'DbSecretEncryptionKey', props.dbSecretEncryptionKeyArn);
    dbSecret.grantRead(ecsAppService.executionRole);
    ecsAppService.ecsContainer.addSecret("DB_ENDPOINT", aws_ecs.Secret.fromSecretsManager(dbSecret, 'host'));
    ecsAppService.ecsContainer.addSecret("DB_USERNAME", aws_ecs.Secret.fromSecretsManager(dbSecret, 'username'));
    ecsAppService.ecsContainer.addSecret("DB_PASSWORD", aws_ecs.Secret.fromSecretsManager(dbSecret, 'password'));
    dbSecretEncryptionKey.grantEncryptDecrypt(ecsAppService.executionRole);
    ecsAppService.ecsService.connections.allowTo(auroraSG, aws_ec2.Port.tcp(5432));

    if (props.windowsBastion || props.linuxBastion) {
      const bastionSecurityGroup = new aws_ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc: props.vpc,
      });
      props.vpc.addInterfaceEndpoint('BastionSsmVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });

      props.vpc.addInterfaceEndpoint('BastionSsmMessagesVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });

      props.vpc.addInterfaceEndpoint('BastionEc2MessagesVpcEndpoint', {
        service: aws_ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: { subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [bastionSecurityGroup],
      });
      // S3's vpc endpoint for yum repo has already been attached in ecs-app-base construct

      if (props.windowsBastion) {
        const windowsBastion = new Bastion(this, `Windows`, {
          os: 'Windows',
          vpc: props.vpc,
          region: this.region,
          auroraSecurityGroupId: auroraSG.securityGroupId,
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
          vpc: props.vpc,
          region: this.region,
          auroraSecurityGroupId: auroraSG.securityGroupId,
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
