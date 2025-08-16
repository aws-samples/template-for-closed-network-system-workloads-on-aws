import {
  aws_ec2,
  aws_ecr_assets,
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_iam,
  aws_logs,
} from 'aws-cdk-lib';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as path from 'path';
import { EncryptionKey } from '../kms/key';

export class EcsAppService extends Construct {
  public readonly ecsService: aws_ecs.FargateService;
  public readonly ecsContainer: aws_ecs.ContainerDefinition;
  public readonly executionRole: aws_iam.Role;
  constructor(
    scope: Construct,
    id: string,
    props: {
      cluster: aws_ecs.Cluster;
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
    this.executionRole = executionRole;

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

    // Add Container
    const nginxDockerAsset = new DockerImageAsset(this, 'NginxAsset', {
      directory: path.join(__dirname, '../../../docker/nginx'),
      platform: aws_ecr_assets.Platform.LINUX_AMD64
    });

    this.ecsContainer = ecsTask.addContainer('EcsApp', {
      // Start the ecsTask with a nginx docker image, later CodePipeLine will deploy the actual app.
      image: aws_ecs.ContainerImage.fromDockerImageAsset(nginxDockerAsset), 
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
        subnets: [...props.cluster.vpc.isolatedSubnets.filter(subnet => subnet.node.id.includes("workload"))],
      }),
      deploymentController: {
        type: aws_ecs.DeploymentControllerType.ECS,
      },
    });

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
