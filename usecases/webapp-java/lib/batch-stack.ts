import {
  aws_ec2,
  aws_ecr,
  aws_ecs,
  aws_events,
  aws_events_targets,
  aws_iam,
  aws_logs,
  aws_stepfunctions,
  Duration,
  StackProps,
  Stack,
  aws_dynamodb,
  aws_sns,
  aws_secretsmanager,
  aws_kms,
} from 'aws-cdk-lib';
import { EcsJob } from './construct/ecs/ecs-job';
import { Bucket } from './construct/s3/bucket';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { EncryptionKey } from './construct/kms/key';

interface BatchStackProps extends StackProps {
  notifyEmail: string;
  repositoryName: string;
  vpc: aws_ec2.Vpc;
  dbSecretName: string;
  dbSecurityGroupId: string;
  dbSecretEncryptionKeyArn: string;
}

export class BatchStack extends Stack {
  constructor(scope: Construct, id: string, props: BatchStackProps) {
    super(scope, id, props);

    // Get network resources
    const vpc = props.vpc;
    const dbSecret = aws_secretsmanager.Secret.fromSecretNameV2(this, 'DbSecret', props.dbSecretName)

    // To prevent from increasing ResourcePolicy by adding jobs
    new aws_logs.ResourcePolicy(this, 'ResourcePolicyToWriteLogs', {
      policyStatements: [
        new aws_iam.PolicyStatement({
          principals: [new aws_iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/vendedlogs/states/*:*`,
          ],
          conditions: {
            StringEquals: {
              'aws:SourceAccount': this.account,
            },
            ArnLike: {
              'aws:SourceArn': `arn:aws:logs:${this.region}:${this.account}:*`,
            },
          },
        }),
      ],
    });

    // Create DynamoDB to store job invocation history
    // PK: Job ID, SK: date, status, message
    const table = new aws_dynamodb.Table(this, 'BatchDynamodb', {
      partitionKey: {
        name: 'pk',
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: aws_dynamodb.AttributeType.STRING,
      },
      encryption: aws_dynamodb.TableEncryption.AWS_MANAGED,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    const s3bucket = new Bucket(this, 'BatchResultBucket');

    // Create SNS to notify errors of batches
    const kmsForSns = new aws_kms.Key(this, 'SnsTopicKms', { enableKeyRotation: true });
    const topic = new aws_sns.Topic(this, 'BatchAlarmTopic', {
      masterKey: kmsForSns,
    });
    new aws_sns.Subscription(this, 'BatchAlarmSubscription', {
      endpoint: props.notifyEmail,
      protocol: aws_sns.SubscriptionProtocol.EMAIL,
      topic: topic,
    });

    // Prepare for ECS resources
    // Role for ECS Agent
    const repository = aws_ecr.Repository.fromRepositoryName(
      this,
      'BatchRepository',
      props.repositoryName
    );

    // Create ECS resources( Cluster and Task )
    const cluster = new aws_ecs.Cluster(this, 'BatchCluster', {
      clusterName: 'BatchCluster',
      vpc: vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    // Create Step functions
    const DB_ENV = {
      DB_ENDPOINT: aws_ecs.Secret.fromSecretsManager(dbSecret, 'host'),
      DB_USERNAME: aws_ecs.Secret.fromSecretsManager(dbSecret, 'username'),
      DB_PASSWORD: aws_ecs.Secret.fromSecretsManager(dbSecret, 'password'),
    };
    const s3Policy = new aws_iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
        's3:GetObject',
        's3:GetObjectAcl',
        's3:DeleteObject',
      ],
      resources: [s3bucket.bucket.bucketArn, `${s3bucket.bucket.bucketArn}/*`],
    });
    const kmsPolicy = new aws_iam.PolicyStatement({
      actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
      resources: [kmsForSns.keyArn],
    });

    // Create child state machines
    const job0001 = new EcsJob(this, 'Job0001', {
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      cluster,
      repository,
      table,
      topic,
      taskDefinitionEnvironments: { BUCKET_NAME: s3bucket.bucket.bucketName },
      taskDefinitionSecrets: { ...DB_ENV },
      taskInput: {
        taskToken: aws_stepfunctions.JsonPath.taskToken,
        invokeDate: aws_stepfunctions.JsonPath.stringAt('$.time'),
      },
    });
    job0001.taskRole.addToPolicy(s3Policy);
    job0001.statemachine.addToRolePolicy(kmsPolicy);

    const job0002 = new EcsJob(this, 'Job0002', {
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      cluster,
      repository,
      table,
      topic,
      taskDefinitionEnvironments: { BUCKET_NAME: s3bucket.bucket.bucketName },
      taskDefinitionSecrets: { ...DB_ENV },
      taskInput: {
        taskToken: aws_stepfunctions.JsonPath.taskToken,
        invokeDate: aws_stepfunctions.JsonPath.stringAt('$.Input.invokeDate'),
      },
    });
    job0002.taskRole.addToPolicy(s3Policy);
    job0002.statemachine.addToRolePolicy(kmsPolicy);

    const job0003 = new EcsJob(this, 'Job0003', {
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      cluster,
      repository,
      table,
      topic,
      taskDefinitionEnvironments: { BUCKET_NAME: s3bucket.bucket.bucketName },
      taskDefinitionSecrets: { ...DB_ENV },
      taskInput: {
        taskToken: aws_stepfunctions.JsonPath.taskToken,
        invokeDate: aws_stepfunctions.JsonPath.stringAt('$.Input.invokeDate'),
      },
    });
    job0003.taskRole.addToPolicy(s3Policy);
    job0003.statemachine.addToRolePolicy(kmsPolicy);

    const job0004 = new EcsJob(this, 'Job0004', {
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      cluster,
      repository,
      table,
      topic,
      taskDefinitionEnvironments: { BUCKET_NAME: s3bucket.bucket.bucketName },
      taskDefinitionSecrets: { ...DB_ENV },
      taskInput: {
        taskToken: aws_stepfunctions.JsonPath.taskToken,
        invokeDate: aws_stepfunctions.JsonPath.stringAt('$.Input.invokeDate'),
      },
    });
    job0004.taskRole.addToPolicy(s3Policy);
    job0004.statemachine.addToRolePolicy(kmsPolicy);

    const job0005 = new EcsJob(this, 'Job0005', {
      dbSecretEncryptionKeyArn: props.dbSecretEncryptionKeyArn,
      cluster,
      repository,
      table,
      topic,
      taskDefinitionEnvironments: { BUCKET_NAME: s3bucket.bucket.bucketName },
      taskDefinitionSecrets: { ...DB_ENV },
      taskInput: {
        taskToken: aws_stepfunctions.JsonPath.taskToken,
        invokeDate: aws_stepfunctions.JsonPath.stringAt('$.Input.invokeDate'),
      },
    });
    job0005.taskRole.addToPolicy(s3Policy);
    job0005.statemachine.addToRolePolicy(kmsPolicy);

    // Create parent state machine
    const definition = job0001.job
      .next(job0002.job)
      .next(job0003.job)
      .next(job0004.job)
      .next(job0005.job);

    const parentStateMachine = new aws_stepfunctions.StateMachine(this, 'ParentStateMachine', {
      definition,
      logs: {
        destination: new aws_logs.LogGroup(this, 'ParentStateMachineLogGroup', {
          logGroupName: '/aws/vendedlogs/states/parentstatemechine',
          encryptionKey: new EncryptionKey(this, 'ParentStateMachineLogGroupKey', {
            servicePrincipals: [new aws_iam.ServicePrincipal('logs.amazonaws.com')],
          }).encryptionKey,
        }),
        level: aws_stepfunctions.LogLevel.ALL,
      },
      timeout: Duration.minutes(10),
      tracingEnabled: true,
    });

    // Add policy to Endpoints
    parentStateMachine.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: [topic.topicArn],
      })
    );
    parentStateMachine.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ['dynamodb:DescribeTable', 'dynamodb:ListTables', 'dynamodb:PutItem'],
        resources: [table.tableArn],
      })
    );

    const sgForDb = aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'DbSecurityGroup',
      props.dbSecurityGroupId
    );
    job0001.task.connections.allowTo(sgForDb, aws_ec2.Port.tcp(5432));
    job0002.task.connections.allowTo(sgForDb, aws_ec2.Port.tcp(5432));
    job0003.task.connections.allowTo(sgForDb, aws_ec2.Port.tcp(5432));
    job0004.task.connections.allowTo(sgForDb, aws_ec2.Port.tcp(5432));
    job0005.task.connections.allowTo(sgForDb, aws_ec2.Port.tcp(5432));

    // Ref: https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
    const rule = new aws_events.Rule(this, 'Rule', {
      schedule: aws_events.Schedule.expression('cron(00 12 ? * MON-FRI *)'),
    });
    rule.addTarget(new aws_events_targets.SfnStateMachine(parentStateMachine));

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      [
        `/${id}/Job0001/EcsServiceTaskRole/Resource`,
        `/${id}/Job0002/EcsServiceTaskRole/Resource`,
        `/${id}/Job0003/EcsServiceTaskRole/Resource`,
        `/${id}/Job0004/EcsServiceTaskRole/Resource`,
        `/${id}/Job0005/EcsServiceTaskRole/Resource`,
      ],
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "Need to store the result files in this bucket from batch scripts, and we don't know task ID until tasks are invoked",
          appliesTo: [
            {
              regex: '/^Resource::(.*)/(.*)/g',
            },
            {
              regex: `/^Resource::arn:aws:ecs:${Stack.of(this).region}:${
                Stack.of(this).account
              }:task/(.*)/(.*)/g`,
            },
            'Resource::*',
          ],
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      [
        `/${id}/Job0001/job0001/Role/DefaultPolicy/Resource`,
        `/${id}/Job0002/job0002/Role/DefaultPolicy/Resource`,
        `/${id}/Job0003/job0003/Role/DefaultPolicy/Resource`,
        `/${id}/Job0004/job0004/Role/DefaultPolicy/Resource`,
        `/${id}/Job0005/job0005/Role/DefaultPolicy/Resource`,
      ],
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'To access the files in this bucket',
          appliesTo: ['Resource::*'],
        },
      ]
    );
    NagSuppressions.addResourceSuppressions(
      parentStateMachine.role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This policy was created automatically by CDK',
          appliesTo: [
            {
              regex:
                '/^Resource::arn:<AWS::Partition>:states:(.*):(.*):execution:\\{"Fn::Select":\\[6,\\{"Fn::Split":\\[":",\\{"Ref":"(.*)"\\}\\]\\}\\]\\}\\*/g',
            },
            'Resource::*',
          ],
        },
      ],
      true
    );
  }
}
