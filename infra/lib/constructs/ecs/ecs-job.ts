import {
  aws_dynamodb,
  aws_ec2,
  aws_ecr,
  aws_ecs,
  aws_iam,
  aws_logs,
  aws_sns,
  aws_stepfunctions,
  aws_stepfunctions_tasks,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { EncryptionKey } from '../kms/key';

export class EcsJob extends Construct {
  private cluster: aws_ecs.Cluster;
  private jobId: string;
  private table: aws_dynamodb.Table;
  private topic: aws_sns.ITopic;
  public readonly statemachine: aws_stepfunctions.StateMachine;
  public readonly job: aws_stepfunctions_tasks.StepFunctionsStartExecution;
  public readonly task: aws_stepfunctions_tasks.EcsRunTask;
  public readonly taskRole: aws_iam.Role;
  constructor(
    scope: Construct,
    id: string,
    props: {
      auroraSecretEncryptionKeyArn: string;
      cluster: aws_ecs.Cluster;
      repository: aws_ecr.IRepository;
      table: aws_dynamodb.Table;
      topic: aws_sns.Topic;
      taskDefinitionEnvironments?: { [key: string]: string };
      taskDefinitionSecrets?: { [key: string]: aws_ecs.Secret };
      // taskInput's type definition is using any for the value. Ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions.TaskInput.html
      taskInput: { [key: string]: any };
    }
  ) {
    super(scope, id);

    // Set private member
    this.cluster = props.cluster;
    this.jobId = id;
    this.table = props.table;
    this.topic = props.topic;

    // Logs Group for Fargate
    const logGroupForFargate = new aws_logs.LogGroup(this, 'FargateLogGroup', {
      retention: aws_logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY, // In production env, you will delete this configuration.
      encryptionKey: new EncryptionKey(this, `${id}FargateLogGroupEncryptionKey`, {
        servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
      }).encryptionKey,
    });

    // Execution Role for task
    const taskExecutionRole = new aws_iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskExecutionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [props.auroraSecretEncryptionKeyArn],
      })
    );

    // Role for task
    this.taskRole = new aws_iam.Role(this, 'EcsServiceTaskRole', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        basePolicy: new aws_iam.PolicyDocument({
          statements: [
            new aws_iam.PolicyStatement({
              actions: [
                'xray:GetSamplingRules',
                'xray:GetSamplingTargets',
                'xray:PutTelemetryRecords',
                'xray:PutTraceSegments',
                'logs:CreateLogDelivery',
                'logs:DeleteLogDelivery',
                'logs:DescribeLogGroups',
                'logs:DescribeResourcePolicies',
                'logs:GetLogDelivery',
                'logs:ListLogDeliveries',
                'logs:PutResourcePolicy',
                'logs:UpdateLogDelivery',
              ],
              resources: ['*'],
            }),
            new aws_iam.PolicyStatement({
              actions: ['ecs:DescribeTasks', 'ecs:StopTask'],
              resources: [
                `arn:aws:ecs:${Stack.of(this).region}:${Stack.of(this).account}:task/${
                  props.cluster.clusterName
                }/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Task Definition
    const taskDefinition = new aws_ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      executionRole: taskExecutionRole,
      taskRole: this.taskRole,
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const container = taskDefinition.addContainer('BatchEcsContainer', {
      image: aws_ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
      environment: props.taskDefinitionEnvironments,
      secrets: props.taskDefinitionSecrets,
      logging: aws_ecs.LogDriver.awsLogs({
        streamPrefix: `${id.toLowerCase()}-`,
        logGroup: logGroupForFargate,
      }),
      readonlyRootFilesystem: true,
    });

    this.task = this.ecsJob('InvokeJob', this.jobId, 'RUNTASK', container, taskDefinition);
    const transformInput = new aws_stepfunctions.Pass(this, 'Transform Input Params', {
      parameters: {
        'invokeDate.$': "States.ArrayGetItem(States.StringSplit($.invokeDate, 'T'), 0)",
      },
    });
    const checkInitialStatus = this.checkStatusJob('CheckJobStatus');
    const jobFailed = new aws_stepfunctions.Fail(this, 'JobFailed', {
      cause: 'Step Functions job was failed',
      error: 'DescribeJob returned FAILED',
    });

    const registerSuccessStatus = this.registerStatusJob(
      'RegisterJobStatusSUCCEEDED',
      'SUCCEEDED',
      'Job was completed'
    );
    const registerFailedStatus = this.registerStatusJob(
      'RegisterJobStatusFAILED',
      'FAILED',
      'Job was failed'
    );

    // Create chain
    const definition = transformInput.next(checkInitialStatus).next(
      new aws_stepfunctions.Choice(this, 'JobSucceeded?')
        .when(
          aws_stepfunctions.Condition.or(
            aws_stepfunctions.Condition.isNotPresent('$.checkStatusData.Item.status.S'),
            aws_stepfunctions.Condition.not(
              aws_stepfunctions.Condition.stringEquals(
                '$.checkStatusData.Item.status.S',
                'SUCCEEDED'
              )
            )
          ),
          this.task
            .addCatch(
              registerFailedStatus.next(
                this.notifyJob('NotifyError', id.toLowerCase()).next(jobFailed)
              ),
              {
                resultPath: '$.status',
              }
            )
            .next(registerSuccessStatus)
        )
        .when(
          aws_stepfunctions.Condition.stringEquals('$.checkStatusData.Item.status.S', 'SUCCEEDED'),
          new aws_stepfunctions.Pass(this, 'JobSkipped')
        )
    );

    this.statemachine = new aws_stepfunctions.StateMachine(this, id.toLowerCase(), {
      definition,
      logs: {
        destination: new aws_logs.LogGroup(this, `${this.jobId}JobLogGroup`, {
          logGroupName: `/aws/vendedlogs/states/${this.jobId}`,
          encryptionKey: new EncryptionKey(this, `${this.jobId}StateMachineLogEncryptionKey`, {
            servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
          }).encryptionKey,
        }),
        level: aws_stepfunctions.LogLevel.ALL,
      },
      timeout: Duration.minutes(5),
      tracingEnabled: true,
    });
    this.job = new aws_stepfunctions_tasks.StepFunctionsStartExecution(
      this,
      `${id.toLowerCase()}Statemachine`,
      {
        stateMachine: this.statemachine,
        integrationPattern: aws_stepfunctions.IntegrationPattern.RUN_JOB,
        input: aws_stepfunctions.TaskInput.fromObject(props.taskInput ? props.taskInput : {}),
      }
    );

    // cdk-nag suppression
    NagSuppressions.addResourceSuppressions(
      taskExecutionRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'GetAuthorizedCode action requires * resource. ref:https://docs.aws.amazon.com/ja_jp/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html#security_iam_id-based-policy-examples-access-one-bucket',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(taskDefinition, [
      {
        id: 'AwsSolutions-ECS2',
        reason:
          "These variables are not confidential, and these are updated with task definitions' update",
      },
    ]);
  }

  // member functiosn
  private ecsJob(
    id: string,
    jobId: string,
    type: string,
    container: aws_ecs.ContainerDefinition,
    taskDefinition: aws_ecs.TaskDefinition
  ) {
    return new aws_stepfunctions_tasks.EcsRunTask(this, id, {
      cluster: this.cluster,
      containerOverrides: [
        {
          containerDefinition: container,
          environment: [
            { name: 'JOB_ID', value: jobId },
            { name: 'JOB_TYPE', value: type },
          ],
        },
      ],
      launchTarget: new aws_stepfunctions_tasks.EcsFargateLaunchTarget(),
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      },
      integrationPattern: aws_stepfunctions.IntegrationPattern.RUN_JOB,
      taskDefinition: taskDefinition,
      taskTimeout: aws_stepfunctions.Timeout.duration(Duration.minutes(5)), // FIXME: It's tempolary setting.
      resultPath: '$.submitResult',
    });
  }

  private checkStatusJob(id: string) {
    return new aws_stepfunctions_tasks.DynamoGetItem(this, id, {
      key: {
        pk: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(this.jobId),
        sk: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
          aws_stepfunctions.JsonPath.stringAt('$.invokeDate')
        ),
      },
      table: this.table,
      resultPath: '$.checkStatusData',
    });
  }

  private registerStatusJob(id: string, status: string, message?: string) {
    return new aws_stepfunctions_tasks.DynamoPutItem(this, id, {
      item: {
        pk: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(this.jobId),
        sk: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
          aws_stepfunctions.JsonPath.stringAt('$.invokeDate')
        ),
        status: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(status),
        message: aws_stepfunctions_tasks.DynamoAttributeValue.fromString(message ? message : ''),
      },
      integrationPattern: aws_stepfunctions.IntegrationPattern.RUN_JOB,
      table: this.table,
    });
  }

  private notifyJob(id: string, jobId: string) {
    return new aws_stepfunctions_tasks.SnsPublish(this, id, {
      topic: this.topic,
      message: aws_stepfunctions.TaskInput.fromObject({
        JOBID: jobId,
        MESSAGE: 'FAILED',
      }),
    });
  }
}
