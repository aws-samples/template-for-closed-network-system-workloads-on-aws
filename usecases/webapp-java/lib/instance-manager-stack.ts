import { CfnOutput, StackProps, Stack, aws_dynamodb, aws_ec2, aws_iam, aws_cognito} from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

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

    // ユーザー情報を保存するDynamoDBテーブルの作成
    this.userTable = new aws_dynamodb.Table(this, 'UserTable', {
      partitionKey: {
        name: 'email',
        type: aws_dynamodb.AttributeType.STRING,
      },
      encryption: aws_dynamodb.TableEncryption.AWS_MANAGED,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      }
    });

    // グループIDによるクエリのためのGSI
    this.userTable.addGlobalSecondaryIndex({
      indexName: USER_TABLE_GROUP_INDEX,
      partitionKey: {
        name: 'groupId',
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'email',
        type: aws_dynamodb.AttributeType.STRING,
      },
      projectionType: aws_dynamodb.ProjectionType.ALL
    });

    // ユーザー一覧取得のためのGSI
    this.userTable.addGlobalSecondaryIndex({
      indexName: USER_TABLE_TYPE_INDEX,
      partitionKey: {
        name: 'entityType',
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: aws_dynamodb.AttributeType.STRING,
      },
      projectionType: aws_dynamodb.ProjectionType.ALL
    });

    // ロールによるクエリのためのGSI
    this.userTable.addGlobalSecondaryIndex({
      indexName: USER_TABLE_ROLE_INDEX,
      partitionKey: {
        name: 'role',
        type: aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'email',
        type: aws_dynamodb.AttributeType.STRING,
      },
      projectionType: aws_dynamodb.ProjectionType.ALL
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
        "isAdmin": new aws_cognito.BooleanAttribute({mutable: true}),
        "groupId": new aws_cognito.StringAttribute({mutable: true})
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

    // セッションシークレットの作成（ランダムな値を生成）
    const sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      secretName: 'instance-manager/session-secret',
      description: 'Instance Manager Session Secret',
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
    new CfnOutput(this, 'UserTableName', {
      exportName: 'UserTableName',
      value: this.userTable.tableName,
    });

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

    NagSuppressions.addResourceSuppressions([
      sessionSecret
    ], [
      {
        id: 'AwsSolutions-SMG4',
        reason: 'This app is for internal use.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(this.userPool, [{
      id: 'AwsSolutions-COG3',
      reason: "It's used on closed network"
    }])
  }
}
