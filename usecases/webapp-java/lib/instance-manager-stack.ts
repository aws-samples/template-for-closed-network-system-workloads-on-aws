import { CfnOutput, StackProps, Stack, aws_dynamodb, aws_ec2, aws_iam, aws_cognito, aws_lambda, aws_sqs, aws_lambda_event_sources, aws_events, aws_events_targets } from 'aws-cdk-lib';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

// DynamoDBテーブル名の定数
export const USER_TABLE_NAME = 'UserTable';
export const USER_TABLE_GROUP_INDEX = 'GroupIndex';
export const USER_TABLE_TYPE_INDEX = 'TypeIndex';
export const USER_TABLE_ROLE_INDEX = 'RoleIndex';

interface InstanceManagerStackProps extends StackProps {
  sharedVpc: aws_ec2.Vpc;
  appRunnerVpcEndpointId: string;
}

export class InstanceManagerStack extends Stack {
  public readonly userTable: aws_dynamodb.Table;
  public readonly userPool: aws_cognito.UserPool;
  public readonly userPoolClient: aws_cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: InstanceManagerStackProps) {
    super(scope, id, props);

    // SQS FIFO キューの作成
    const instanceDeadLetterQueue = new aws_sqs.Queue(this,'InstanceDeadLetterQueue', {
      fifo: true,
      enforceSSL: true
    });
    const instanceQueue = new aws_sqs.Queue(this, 'InstanceQueue', {
      fifo: true,
      contentBasedDeduplication: true, // 重複排除を有効化
      queueName: 'ice-instance-recovery-queue.fifo',
      enforceSSL: true,
      deadLetterQueue: {
        queue: instanceDeadLetterQueue,
        maxReceiveCount: 50
      }
    });

    // Lambda 関数の作成
    const iceRecoveryFunction = new NodejsFunction(this, 'IceRecoveryFunction', {
      runtime: aws_lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '../functions/ice-recovery/index.ts'),
    });

    // EC2 インスタンスに対する権限を付与
    iceRecoveryFunction.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'ec2:DescribeInstances',
        'ec2:StartInstances',
        'ec2:StopInstances',
        'ec2:RunInstances',
        'ec2:ModifyInstanceAttribute'
      ],
      resources: ['*']
    }));

    // Lambda に SQS トリガーを連携させる
    iceRecoveryFunction.addEventSource(new aws_lambda_event_sources.SqsEventSource(instanceQueue, {
      batchSize: 1,
    }));

    // Lambda がキューを受け取ることができる権限を付与
    instanceQueue.grantConsumeMessages(iceRecoveryFunction);
    
    // EventBridge Scheduler実行ロールの作成
    const schedulerExecutionRole = new aws_iam.Role(this, 'EventBridgeSchedulerExecutionRole', {
      roleName: 'EventBridgeSchedulerExecutionRole',
      assumedBy: new aws_iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role for EventBridge Scheduler to execute EC2 actions'
    });
    
    // EC2インスタンスの起動・停止権限を付与
    schedulerExecutionRole.addToPolicy(new aws_iam.PolicyStatement({
      actions: [
        'ec2:StartInstances',
        'ec2:StopInstances'
      ],
      resources: ['*']
    }));

    // ICE のログのイベントをトリガーに SQS へキューイングするためのルール 
    new aws_events.Rule(this, 'IceEventRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['ec2.amazonaws.com'],
          eventName: ['StartInstances', 'RunInstances'], // 起動に関するイベントをキャッチする
          errorCode: ['Server.InsufficientInstanceCapacity']
        },
      },
      targets: [new aws_events_targets.SqsQueue(instanceQueue, {
        message: aws_events.RuleTargetInput.fromObject({
          // ログからインスタンス ID をメッセージに詰める
          instanceId: aws_events.EventField.fromPath('$.detail.requestParameters.instancesSet.items[0].instanceId'),
        }),
        // FIFOキューではメッセージグループIDが必須のため、メッセージグループIDを決める必要がある（ここでは、簡単のためにインスタンスIDを利用した）
        messageGroupId: aws_events.EventField.fromPath('$.detail.requestParameters.instancesSet.items[0].instanceId'),
      })]
    });

    // Cognitoユーザープールの作成
    this.userPool = new aws_cognito.UserPool(this, 'InstanceManagerUserPool', {
      userPoolName: 'instance-manager-user-pool',
      selfSignUpEnabled: false, // 管理者のみがユーザーを作成可能
      signInAliases: {
        email: true // メールアドレスでのサインインを有効化
      },
      autoVerify: {
        email: true // メールアドレスの自動検証を有効化
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        }
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      customAttributes: {
        "isAdmin": new aws_cognito.BooleanAttribute({ mutable: true }),
        "groupId": new aws_cognito.StringAttribute({ mutable: true })
      }
    });

    // ユーザープールドメインの設定
    const userPoolDomain = this.userPool.addDomain('InstanceManagerDomain', {
      cognitoDomain: {
        domainPrefix: `instance-manager-${this.account.substring(0, 8)}`
      }
    });

    // ユーザープールクライアントの作成
    this.userPoolClient = this.userPool.addClient('InstanceManagerClient', {
      userPoolClientName: 'instance-manager-client',
      authFlows: {
        userPassword: true,
        user: true
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true // 認可コードフローを有効化
        },
        scopes: [
          aws_cognito.OAuthScope.EMAIL,
          aws_cognito.OAuthScope.OPENID,
          aws_cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback', // ローカル開発用
          `https://${props.appRunnerVpcEndpointId}.execute-api.${this.region}.amazonaws.com/auth/callback` // 本番環境用
        ],
        logoutUrls: [
          'http://localhost:3000/', // ローカル開発用
          `https://${props.appRunnerVpcEndpointId}.execute-api.${this.region}.amazonaws.com/` // 本番環境用
        ]
      },
      supportedIdentityProviders: [
        aws_cognito.UserPoolClientIdentityProvider.COGNITO
      ],
      generateSecret: true
    });

    // ローカルのコードをビルドしてECRにプッシュ
    const instanceManagerAsset = new assets.DockerImageAsset(this, 'InstanceManagerDockerImage', {
      directory: path.join(__dirname, '../instance-manager'),
      cacheDisabled: true,
    });

    // // AppRunnerサービスを作成
    // const service = new apprunner.Service(this, 'InstanceManagerService', {
    //   serviceName: 'instance-manager',
    //   source: apprunner.Source.fromAsset({
    //     imageConfiguration: {
    //       port: 3000,
    //       environmentVariables: {
    //         EMAIL_FROM: "suzukyz+totp@amazon.co.jp",
    //         USER_TABLE_NAME: this.userTable.tableName,
    //         USER_TABLE_GROUP_INDEX: USER_TABLE_GROUP_INDEX,
    //         USER_TABLE_TYPE_INDEX: USER_TABLE_TYPE_INDEX,
    //         USER_TABLE_ROLE_INDEX: USER_TABLE_ROLE_INDEX
    //       },
    //       environmentSecrets: {
    //         OAUTH2_SECRET: apprunner.Secret.fromSecretsManager(oauth2Secret),
    //         SESSION_SECRET: apprunner.Secret.fromSecretsManager(sessionSecret),
    //       }
    //     },
    //     asset: instanceManagerAsset,
    //   }),
    //   cpu: apprunner.Cpu.ONE_VCPU,
    //   memory: apprunner.Memory.TWO_GB,
    //   autoDeploymentsEnabled: true,
    //   isPubliclyAccessible: false // For closed network
    // });
    // service.addToRolePolicy(
    //   new aws_iam.PolicyStatement({
    //     actions: [
    //       "cloudwatch:Get*",
    //       "cloudwatch:Describe*",
    //     ],
    //     resources: ["*"],
    //   })
    // );

    // Associate App Runner Service with VPC Endpoint
    const interfaceVpcEndpoint = aws_ec2.InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(this, 'AppRunnerVpcEndpoint', {
      vpcEndpointId: props.appRunnerVpcEndpointId,
      port: 443
    })
    // new apprunner.VpcIngressConnection(this, 'VpcIngressConnection', {
    //   vpc: props.sharedVpc,
    //   interfaceVpcEndpoint,
    //   service,
    // });

    // // シークレットへのアクセス権限を追加
    // service.addToRolePolicy(
    //   new aws_iam.PolicyStatement({
    //     actions: [
    //       "secretsmanager:GetSecretValue",
    //       "secretsmanager:DescribeSecret"
    //     ],
    //     resources: [
    //       oauth2Secret.secretArn,
    //       sessionSecret.secretArn
    //     ],
    //   })
    // );

    // // Cognitoへのアクセス権限を追加
    // service.addToRolePolicy(
    //   new aws_iam.PolicyStatement({
    //     actions: [
    //       "cognito-idp:InitiateAuth",
    //       "cognito-idp:RespondToAuthChallenge",
    //       "cognito-idp:AdminGetUser"
    //     ],
    //     resources: [this.userPool.userPoolArn]
    //   })
    // );

    // // DynamoDBへのアクセス権限を追加
    // this.userTable.grantReadWriteData(service);

    // 出力
    // new CfnOutput(this, 'AppRunnerServiceUrl', {
    //   exportName: 'AppRunnerServiceUrl',
    //   value: service.serviceUrl
    // });

    // NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), 
    //   [
    //     `${service.node.path}/InstanceRole/DefaultPolicy/Resource`,
    //     `${service.node.path}/AccessRole/DefaultPolicy/Resource`,
    //   ], 
    //   [{
    //     id: 'AwsSolutions-IAM5',
    //     reason: 'To use ManagedPolicy for AppRunner service',
    //   }]
    // );

    NagSuppressions.addResourceSuppressions(this.userPool, [{
      id: 'AwsSolutions-COG3',
      reason: "It's used on closed network"
    }]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `${iceRecoveryFunction.node.path}/ServiceRole/DefaultPolicy/Resource`, [{
      id: 'AwsSolutions-IAM5',
      reason: 'To manage all instances',
    }]);
    NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), `${schedulerExecutionRole.node.path}/DefaultPolicy/Resource`, [{
      id: 'AwsSolutions-IAM5',
      reason: 'To manage all instances',
    }]);
    NagSuppressions.addResourceSuppressions(iceRecoveryFunction.role!, [{
      id: 'AwsSolutions-IAM4',
      reason: 'To use ManagedPolicy for AppRunner service',
    }]);
  }
}
