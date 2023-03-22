import {
  aws_ec2,
  aws_ecr,
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_iam,
  aws_logs,
  aws_secretsmanager,
} from 'aws-cdk-lib';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as path from 'path';
import { EncryptionKey } from '../kms/key';

export class EcsAppService extends Construct {
  public readonly ecsService: aws_ecs.FargateService;
  public readonly ecsContainer: aws_ecs.ContainerDefinition;
  constructor(
    scope: Construct,
    id: string,
    props: {
      auroraSecretName: string;
      auroraSecurityGroupId: string;
      auroraSecretEncryptionKeyArn: string;
      cluster: aws_ecs.Cluster;
      repository: aws_ecr.IRepository;
      targetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
      httpsTargetGroup: aws_elasticloadbalancingv2.ApplicationTargetGroup;
    }
  ) {
    super(scope, id);

    // Role for ECS Agent
    const executionRole = new aws_iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
      inlinePolicies: {
        PullThroughCache: new aws_iam.PolicyDocument({
          statements: [
            new aws_iam.PolicyStatement({
              actions: ['ecr:BatchImportUpstreamImage', 'ecr:CreateRepository'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Role for Container
    const serviceTaskRole = new aws_iam.Role(this, 'EcsServiceTaskRole', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // CloudWatch Logs Group for Container
    const logGroupForCluster = new aws_logs.LogGroup(this, 'FargateLogGroup', {
      retention: aws_logs.RetentionDays.THREE_MONTHS,
      encryptionKey: new EncryptionKey(this, 'AppFargateLogGroupEncryptionKey', {
        servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    // Task definition
    const ecsTask = new aws_ecs.FargateTaskDefinition(this, 'EcsTask', {
      executionRole: executionRole,
      taskRole: serviceTaskRole,
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    const auroraSecret = aws_secretsmanager.Secret.fromSecretNameV2(
      this,
      'AuroraSecret',
      props.auroraSecretName
    );
    executionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [props.auroraSecretEncryptionKeyArn],
      })
    );

    // Add Container
    const nginxDockerAsset = new DockerImageAsset(this, 'NginxAsset', {
      directory: path.join(__dirname, '../../../docker/nginx'),
    });

    this.ecsContainer = ecsTask.addContainer('EcsApp', {
      // Start the ecsTask with a nginx docker image, later CodePipeLine will deploy the actual app.
      image: aws_ecs.ContainerImage.fromDockerImageAsset(nginxDockerAsset),

      secrets: {
        DB_ENDPOINT: aws_ecs.Secret.fromSecretsManager(auroraSecret, 'host'),
        DB_USERNAME: aws_ecs.Secret.fromSecretsManager(auroraSecret, 'username'),
        DB_PASSWORD: aws_ecs.Secret.fromSecretsManager(auroraSecret, 'password'),
      },
      logging: aws_ecs.LogDriver.awsLogs({
        streamPrefix: `${id}-`,
        logGroup: logGroupForCluster,
      }),
      readonlyRootFilesystem: true,
    });

    this.ecsContainer.addPortMappings({
      containerPort: 8080,
    });

    // Service
    const sgForAurora = aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'AuroraSecurityGroup',
      props.auroraSecurityGroupId
    );
    this.ecsService = new aws_ecs.FargateService(this, 'FargateService', {
      cluster: props.cluster,
      taskDefinition: ecsTask,
      desiredCount: 2,
      platformVersion: aws_ecs.FargatePlatformVersion.LATEST,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
      ],
      vpcSubnets: props.cluster.vpc.selectSubnets({
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
      deploymentController: {
        type: aws_ecs.DeploymentControllerType.ECS,
      },
    });
    this.ecsService.connections.allowTo(sgForAurora, aws_ec2.Port.tcp(5432));

    // props.targetGroup.addTarget(this.ecsService);
    props.httpsTargetGroup.addTarget(this.ecsService);

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(executionRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'Recommended to use in docs. ref: https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/task_execution_IAM_role.html',
      },
    ]);
  }
}
