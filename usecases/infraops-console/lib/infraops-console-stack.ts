import { CfnOutput, StackProps, Stack, aws_dynamodb, aws_ec2, aws_iam, aws_cognito, aws_lambda, aws_sqs, aws_lambda_event_sources, aws_events, aws_events_targets, aws_cognito_identitypool, Duration, CfnJson } from 'aws-cdk-lib';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { UserPoolAuthenticationProvider } from 'aws-cdk-lib/aws-cognito-identitypool';

interface InfraopsConsoleStackProps extends StackProps {
  sourceVpcId: string;
  appRunnerVpcEndpointId: string;
}

export class InfraopsConsoleStack extends Stack {
  public readonly userTable: aws_dynamodb.Table;
  public readonly userPool: aws_cognito.UserPool;
  public readonly userPoolClient: aws_cognito.UserPoolClient;
  public readonly idPool: aws_cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: InfraopsConsoleStackProps) {
    super(scope, id, props);

    const sourceVpc = aws_ec2.Vpc.fromLookup(this, 'SourceVpc', {vpcId: props.sourceVpcId});
    const interfaceVpcEndpoint = aws_ec2.InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(this, 'AppRunnerVpcEndpoint', {
      vpcEndpointId: props.appRunnerVpcEndpointId,
      port: 443
    })

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
    this.userPool = new aws_cognito.UserPool(this, 'InfraopsConsoleUserPool', {
      userPoolName: 'infraops-console-user-pool',
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
    this.userPool.addGroup('Admins', {
      groupName: 'Admins',
      description: 'Administrators group with full access'
    });
    this.userPool.addGroup('Users', {
      groupName: 'Users',
      description: 'Regular users group with limited access'
    });

    // ユーザープールドメインの設定
    const userPoolDomain = this.userPool.addDomain('InfraopsConsoleDomain', {
      cognitoDomain: {
        domainPrefix: `infraops-console-${this.account.substring(0, 8)}`
      },
    });

    // ユーザープールクライアントの作成
    this.userPoolClient = this.userPool.addClient('InfraopsConsoleClient', {
      userPoolClientName: 'infraops-console-client',
      idTokenValidity: Duration.minutes(60),
      accessTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(1),
      authFlows: {
        adminUserPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false
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

    // Cognito IDプールの作成（CfnIdentityPoolを使用）
    this.idPool = new aws_cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true
        }
      ]
    });

    // Admins用のIAMロール作成（フルアクセス権限）
    const adminRole = new aws_iam.Role(this, 'AdminRole', {
      assumedBy: new aws_iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          "StringEquals": {
            "cognito-identity.amazonaws.com:aud": this.idPool.ref
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated"
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for Admins group with full access'
    });

    // Admins用ポリシー（既存のAuthenticatedUserPolicyと同等）
    adminRole.attachInlinePolicy(new aws_iam.Policy(this, 'AdminPolicy', {
      statements: [
        new aws_iam.PolicyStatement({
          actions: [
            // EC2関連の権限
            "ec2:DescribeInstances",
            "ec2:StartInstances",
            "ec2:StopInstances",
            "ec2:DescribeInstanceTypes",
            "ec2:CreateTags",
            "ec2:GetInstanceTypesFromInstanceRequirements",
            "ec2:DescribeInstanceTypeOfferings",
            // ECS関連の権限
            "ecs:ListClusters",
            "ecs:ListServices",
            "ecs:DescribeServices",
            "ecs:UpdateService",
            // RDS関連の権限
            "rds:DescribeDBClusters",
            "rds:StopDBCluster",
            "rds:StartDBCluster",
            // EventBridge Scheduler関連の権限
            "scheduler:CreateSchedule",
            "scheduler:GetSchedule",
            "scheduler:UpdateSchedule",
            "scheduler:DeleteSchedule",
            "scheduler:ListSchedules",
            // Cognito関連の権限
            "cognito-idp:ForgotPassword",
            "cognito-idp:ConfirmForgotPassword",
            "cognito-idp:GetUser",
            "cognito-idp:InitiateAuth",
            "cognito-idp:RespondToAuthChallenge"
          ],
          resources: ["*"]
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "iam:PassRole"
          ],
          resources: [
            schedulerExecutionRole.roleArn
          ]
        })
      ]
    }));

    // Users用のIAMロール作成（ABAC適用）
    const usersRole = new aws_iam.Role(this, 'UsersRole', {
      assumedBy: new aws_iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          "StringEquals": {
            "cognito-identity.amazonaws.com:aud": this.idPool.ref
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated"
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for Users group with ABAC-based access control'
    });

    // Users用ポリシー（ABACを適用）
    usersRole.attachInlinePolicy(new aws_iam.Policy(this, 'UsersGroupPolicy', {
      statements: [
        // EC2関連の権限（ABACを適用）
        new aws_iam.PolicyStatement({
          actions: [
            "ec2:DescribeInstances",
            "ec2:StartInstances",
            "ec2:StopInstances",
            "ec2:DescribeInstanceTypes",
            "ec2:CreateTags",
            "ec2:GetInstanceTypesFromInstanceRequirements",
            "ec2:DescribeInstanceTypeOfferings"
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'ec2:ResourceTag/GroupId': '${cognito-identity.amazonaws.com:custom:groupId}'
            }
          }
        }),
        // ECS関連の権限（ABACを適用）
        new aws_iam.PolicyStatement({
          actions: [
            "ecs:ListClusters",
            "ecs:ListServices",
            "ecs:DescribeServices",
            "ecs:UpdateService"
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'ecs:ResourceTag/GroupId': '${cognito-identity.amazonaws.com:custom:groupId}'
            }
          }
        }),
        // RDS関連の権限（ABACを適用）
        new aws_iam.PolicyStatement({
          actions: [
            "rds:DescribeDBClusters"
          ],
          resources: ["*"],
        }),
        new aws_iam.PolicyStatement({
          actions: [
            "rds:StopDBCluster",
            "rds:StartDBCluster"
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'rds:cluster-tag/GroupId': '${cognito-identity.amazonaws.com:custom:groupId}'
            }
          }
        }),
        // EventBridge Scheduler関連の権限（ABACを適用）
        new aws_iam.PolicyStatement({
          actions: [
            "scheduler:CreateSchedule",
            "scheduler:GetSchedule",
            "scheduler:UpdateSchedule",
            "scheduler:DeleteSchedule",
            "scheduler:ListSchedules"
          ],
          resources: ["*"],
          conditions: {
            'StringEquals': {
              'scheduler:ResourceTag/GroupId': '${cognito-identity.amazonaws.com:custom:groupId}'
            }
          }
        }),
        // Cognito関連の権限（ABACなし - 全ユーザーが利用可能）
        new aws_iam.PolicyStatement({
          actions: [
            "cognito-idp:ForgotPassword",
            "cognito-idp:ConfirmForgotPassword",
            "cognito-idp:GetUser",
            "cognito-idp:InitiateAuth",
            "cognito-idp:RespondToAuthChallenge"
          ],
          resources: ["*"]
        }),
        // PassRole権限（ABACなし）
        new aws_iam.PolicyStatement({
          actions: [
            "iam:PassRole"
          ],
          resources: [
            schedulerExecutionRole.roleArn
          ]
        })
      ]
    }));

    // CfnJsonを使用してroleMappingsを動的に構築
    const roleMappingsJson = new CfnJson(this, 'RoleMappingsJson', {
      value: {
        [`cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}:${this.userPoolClient.userPoolClientId}`]: {
          Type: 'Rules',
          AmbiguousRoleResolution: 'Deny',
          RulesConfiguration: {
            Rules: [
              {
                Claim: 'cognito:groups',
                MatchType: 'Contains',
                Value: 'Admins',
                RoleARN: adminRole.roleArn
              },
              {
                Claim: 'cognito:groups',
                MatchType: 'Contains',
                Value: 'Users',
                RoleARN: usersRole.roleArn
              }
            ]
          }
        }
      }
    });

    // ロールマッピングの作成（CfnIdentityPoolRoleAttachmentを使用）
    new aws_cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.idPool.ref,
      roleMappings: roleMappingsJson,
      roles: {
        'authenticated': usersRole.roleArn
      }
    });

//     // ローカルのコードをビルドしてECRにプッシュ
//     const instanceManagerAsset = new assets.DockerImageAsset(this, 'InfraopsConsoleDockerImage', {
//       directory: path.join(__dirname, '../webapp'),
//       cacheDisabled: true,
//     });
// 
    // // AppRunnerサービスを作成
    // const service = new apprunner.Service(this, 'InfraopsConsoleService', {
    //   serviceName: 'infraops-console',
    //   source: apprunner.Source.fromAsset({
    //     imageConfiguration: {
    //       port: 3000,
    //       environmentVariables: {
    //         SESSION_SECRET: '1nfra0ps-c0ns0l3-s3cr3t',
    //         CLIENT_ID: this.userPoolClient.userPoolClientId,
    //         CLIENT_SECRET: this.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
    //         USER_POOL_ID: this.userPool.userPoolId,
    //         DOMAIN: `infraops-console-${Stack.of(this).account}`,
    //         AWS_REGION: Stack.of(this).region,
    //         EVENTBRIDGE_SCHEDULER_ROLE_ARN: schedulerExecutionRole.roleArn
    //       },
    //     },
    //     asset: instanceManagerAsset,
    //     
    //   }),
    //   cpu: apprunner.Cpu.ONE_VCPU,
    //   memory: apprunner.Memory.TWO_GB,
    //   autoDeploymentsEnabled: true,
    //   isPubliclyAccessible: false, // For closed network
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
    
    // new apprunner.VpcIngressConnection(this, 'VpcIngressConnection', {
    //   vpc: sourceVpc,
    //   service,
    //   interfaceVpcEndpoint,
    // });

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
    // NagSuppressions.addResourceSuppressionsByPath(Stack.of(this), [
    //   `/${Stack.of(this).stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`
    // ],[{
    //   id: 'AwsSolutions-IAM4',
    //   reason: 'To use ManagedPolicy for service',
    // }])
  }
}
