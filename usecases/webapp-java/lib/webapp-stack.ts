import { aws_ec2, aws_ecs, aws_iam, aws_rds, StackProps, Stack, aws_secretsmanager, aws_kms, aws_elasticloadbalancingv2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcsAppBase } from './construct/ecs/ecs-app-base';
import { EcsAppService } from './construct/ecs/ecs-app-service';

interface WebappStackProps extends StackProps {
  dbCluster: aws_rds.DatabaseCluster | aws_rds.ServerlessCluster;
  dbSecretName: string;
  dbSecretEncryptionKeyArn: string;
  vpc: aws_ec2.Vpc;
  sharedVpc: aws_ec2.Vpc;
  tgw: aws_ec2.CfnTransitGateway;
  domainName: string;
  certificateArn: string;
}

export class WebappStack extends Stack {
  public readonly ecsService: aws_ecs.FargateService;
  public readonly containerName: string;
  public readonly alb: aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props: WebappStackProps) {
    super(scope, id, props);

    const auroraSg = props.dbCluster.connections.securityGroups[0];

    // Create ECS
    const ecsBase = new EcsAppBase(this, `WebappBase`, {
      vpc: props.vpc,
      domainName: props.domainName,
      certificateArn: props.certificateArn,
    });
    this.alb = ecsBase.alb;
    // Allow bastions to access to an web application
    ecsBase.albSg.addIngressRule(aws_ec2.Peer.ipv4(props.sharedVpc.vpcCidrBlock), aws_ec2.Port.HTTPS);

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
    ecsAppService.ecsService.connections.allowTo(auroraSg, aws_ec2.Port.tcp(5432));

  }
}
