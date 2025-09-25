// AWS SDKの実装
import { 
  EC2Client, 
  DescribeInstancesCommand, 
  StartInstancesCommand, 
  StopInstancesCommand,
  DescribeInstanceTypesCommand,
  CreateTagsCommand,
  InstanceTypeInfo,
  GetInstanceTypesFromInstanceRequirementsCommand,
  ArchitectureType,
  VirtualizationType,
  InstanceRequirementsRequest,
  DescribeInstanceTypeOfferingsCommand,
  LocationType,
  DescribeInstancesCommandInput,
  DescribeInstancesCommandOutput,
  StartInstancesCommandOutput,
  StopInstancesCommandOutput,
} from '@aws-sdk/client-ec2';
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
  ListClustersCommandOutput,
  ListServicesCommandOutput,
  DescribeServicesCommandOutput
} from '@aws-sdk/client-ecs';
import {
  RDSClient,
  DescribeDBClustersCommand,
  StopDBClusterCommand,
  StartDBClusterCommand,
  DescribeDBClustersCommandOutput
} from '@aws-sdk/client-rds';
import {
  SchedulerClient,
  CreateScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  ListSchedulesCommand,
  FlexibleTimeWindowMode,
  ScheduleState,
  ScheduleSummary
} from '@aws-sdk/client-scheduler';
import { 
  CognitoIdentityProviderClient,
  GetUserCommand,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  RespondToAuthChallengeCommand,
  RespondToAuthChallengeCommandInput,
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
  AuthFlowType,
  GetUserCommandOutput,
  RespondToAuthChallengeCommandOutput,
  ForgotPasswordCommandOutput,
  ConfirmForgotPasswordCommandOutput,
  InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import crypto from 'crypto';
import { fromCognitoIdentityPool, fromIni } from "@aws-sdk/credential-providers";
import { getSession } from '~/utils/session.server';

// リージョンの設定
const REGION = process.env.AWS_REGION || 'us-east-1'; // デフォルトは東京リージョン

// AWS SDKのクライアント設定
export const makeClientConfig = async () => {
  return {
    region: REGION,
    credentials: (process.env.NODE_ENV === "production") ? 
    fromCognitoIdentityPool({
      clientConfig: { region: REGION },
      identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID || '',
      logins: {
        [`cognito-idp.${REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`]: await getSession().then(session => session.get('idToken') || '')
      }
    }):
    fromIni({ profile: 'closedtemplate' }),
  }
};

// AWS SDKクライアントの共通インターフェース
interface AWSClient {
  destroy(): void;
}

// AWS SDKクライアントのコンストラクタ型
type AWSClientConstructor<T extends AWSClient> = new (config: any) => T;

// 汎用的なAWSクライアント高階関数（ログ機能付き）
const withAWSClient = async <TClient extends AWSClient, TResult>(
  ClientClass: AWSClientConstructor<TClient>,
  operation: (client: TClient) => Promise<TResult>,
  options?: {
    errorHandler?: (error: any) => TResult;
    serviceName?: string;
    operationName?: string;
    params?: any;
  }
): Promise<TResult> => {
  const client = new ClientClass(await makeClientConfig());
  const { errorHandler, serviceName, operationName, params } = options || {};
  
  if (serviceName && operationName) {
    console.log(`${serviceName} ${operationName} called${params ? ' with:' : ''}`, params || '');
  }
  
  try {
    return await operation(client);
  } catch (error) {
    if (serviceName && operationName) {
      console.error(`Error in ${serviceName} ${operationName}:`, error);
    }
    
    if (errorHandler) {
      return errorHandler(error);
    }
    throw error;
  } finally {
    client.destroy();
  }
};

export const ec2Client = {
  describeInstances: async (params: DescribeInstancesCommandInput) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new DescribeInstancesCommand(params);
        return await client.send(command);
      },
      {
        serviceName: 'EC2',
        operationName: 'describeInstances',
        params,
        errorHandler: (error): DescribeInstancesCommandOutput => {
          // エラーが発生した場合は空のレスポンスを返す
          return { 
            Reservations: [],
            $metadata: {}
          };
        }
      }
    );
  },

  startInstance: async (params: { instanceId: string }) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new StartInstancesCommand({
          InstanceIds: [params.instanceId]
        });
        return await client.send(command);
      },
      {
        serviceName: 'EC2',
        operationName: 'startInstance',
        params,
        errorHandler: (error): StartInstancesCommandOutput => {
          // エラーが発生した場合は空のレスポンスを返す
          return { 
            StartingInstances: [],
            $metadata: {}
          };
        }
      }
    );
  },

  stopInstance: async (params: { instanceId: string }) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new StopInstancesCommand({
          InstanceIds: [params.instanceId]
        });
        return await client.send(command);
      },
      {
        serviceName: 'EC2',
        operationName: 'stopInstance',
        params,
        errorHandler: (error): StopInstancesCommandOutput => {
          // エラーが発生した場合は空のレスポンスを返す
          return { 
            StoppingInstances: [],
            $metadata: {}
          };
        }
      }
    );
  },

  describeInstanceTypes: async (params: { filters?: Array<{ Name: string, Values: string[] }> }): Promise<{InstanceTypes: InstanceTypeInfo[]; NextToken?: string}> => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new DescribeInstanceTypesCommand({
          Filters: params.filters
        });
        const { InstanceTypes, NextToken } = await client.send(command);
        return { 
          InstanceTypes: InstanceTypes ? InstanceTypes : [], 
          NextToken 
        };
      },
      {
        serviceName: 'EC2',
        operationName: 'describeInstanceTypes',
        params,
        errorHandler: (error) => {
          // エラーが発生した場合は空のレスポンスを返す
          return { InstanceTypes: [], NextToken: undefined };
        }
      }
    );
  },

  createTags: async (params: { resourceIds: string[], tags: Array<{ Key: string, Value: string }> }) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new CreateTagsCommand({
          Resources: params.resourceIds,
          Tags: params.tags
        });
        return await client.send(command);
      },
      {
        serviceName: 'EC2',
        operationName: 'createTags',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },

  getInstanceTypesFromInstanceRequirements: async (params: {
    architectureTypes: ArchitectureType[],
    virtualizationTypes: VirtualizationType[],
    instanceRequirements: InstanceRequirementsRequest
  }) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new GetInstanceTypesFromInstanceRequirementsCommand({
          ArchitectureTypes: params.architectureTypes,
          VirtualizationTypes: params.virtualizationTypes,
          InstanceRequirements: params.instanceRequirements
        });
        const response = await client.send(command);
        return {
          InstanceTypes: response.InstanceTypes || [],
          NextToken: response.NextToken
        };
      },
      {
        serviceName: 'EC2',
        operationName: 'getInstanceTypesFromInstanceRequirements',
        params,
        errorHandler: (error) => {
          return { InstanceTypes: [], NextToken: undefined };
        }
      }
    );
  },

  describeInstanceTypeOfferings: async (params: { 
    filters?: Array<{ Name: string, Values: string[] }>,
    locationType?: LocationType,
  }) => {
    return await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new DescribeInstanceTypeOfferingsCommand({
          Filters: params.filters,
          LocationType: params.locationType || 'region',
        });
        const response = await client.send(command);
        return {
          InstanceTypeOfferings: response.InstanceTypeOfferings || [],
          NextToken: response.NextToken
        };
      },
      {
        serviceName: 'EC2',
        operationName: 'describeInstanceTypeOfferings',
        params,
        errorHandler: (error) => {
          return { InstanceTypeOfferings: [], NextToken: undefined };
        }
      }
    );
  }
};

// schedulerClientの実装
export const schedulerClient = {
  // スケジュールの作成
  createSchedule: async (params: {
    name: string;
    instanceId: string;
    action: 'start' | 'stop';
    cronExpression: string;
    description?: string;
  }) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        // ターゲットの設定
        const targetInput = JSON.stringify({
          InstanceIds: [params.instanceId]
        });
        
        // EC2 StartInstances または StopInstances APIのARNを設定
        const targetArn = params.action === 'start' 
          ? `arn:aws:scheduler:::aws-sdk:ec2:startInstances`
          : `arn:aws:scheduler:::aws-sdk:ec2:stopInstances`;
        
        const command = new CreateScheduleCommand({
          Name: params.name,
          ScheduleExpression: `cron(${params.cronExpression})`,
          Description: params.description || `${params.action === 'start' ? '起動' : '停止'} スケジュール for ${params.instanceId}`,
          State: ScheduleState.ENABLED,
          Target: {
            Arn: targetArn,
            RoleArn: process.env.EVENTBRIDGE_SCHEDULER_ROLE_ARN,
            Input: targetInput
          },
          FlexibleTimeWindow: {
            Mode: FlexibleTimeWindowMode.OFF
          }
        });
        
        return await client.send(command);
      },
      {
        serviceName: 'Scheduler',
        operationName: 'createSchedule',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // スケジュールの取得
  getSchedule: async (params: {name: string}) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        const command = new GetScheduleCommand({
          Name: params.name
        });
        return await client.send(command);
      },
      {
        serviceName: 'Scheduler',
        operationName: 'getSchedule',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // スケジュールの更新
  updateSchedule: async (params: {
    name: string;
    instanceId: string;
    action: 'start' | 'stop';
    cronExpression: string;
    description?: string;
  }) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        // ターゲットの設定
        const targetInput = JSON.stringify({
          instanceId: params.instanceId
        });
        
        // EC2 StartInstances または StopInstances APIのARNを設定
        const targetArn = params.action === 'start' 
          ? `arn:aws:scheduler:::aws-sdk:ec2:startInstances`
          : `arn:aws:scheduler:::aws-sdk:ec2:stopInstances`;
        
        const command = new UpdateScheduleCommand({
          Name: params.name,
          ScheduleExpression: `cron(${params.cronExpression})`,
          Description: params.description || `${params.action === 'start' ? '起動' : '停止'} スケジュール for ${params.instanceId}`,
          State: ScheduleState.ENABLED,
          Target: {
            Arn: targetArn,
            RoleArn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID || ''}:role/EventBridgeSchedulerExecutionRole`,
            Input: targetInput
          },
          FlexibleTimeWindow: {
            Mode: FlexibleTimeWindowMode.OFF
          }
        });
        
        return await client.send(command);
      },
      {
        serviceName: 'Scheduler',
        operationName: 'updateSchedule',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // スケジュールの削除
  deleteSchedule: async (params: {name: string}) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        const command = new DeleteScheduleCommand({
          Name: params.name
        });
        return await client.send(command);
      },
      {
        serviceName: 'Scheduler',
        operationName: 'deleteSchedule',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // インスタンスに関連するスケジュールの一覧取得
  listSchedulesForInstance: async (params:{instanceId: string}) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        // スケジュール名のプレフィックスでフィルタリング
        const command = new ListSchedulesCommand({
          NamePrefix: params.instanceId
        });
        
        const listSchedules = await client.send(command);
        console.log(`Schedules: ${JSON.stringify(listSchedules)}`)
        
        const getScheduleCommands = listSchedules.Schedules?.map((schedule: ScheduleSummary) => {
          return client.send(new GetScheduleCommand({
            Name: schedule.Name!,
            GroupName: schedule.GroupName!
          }));
        });

        const response = await Promise.all(getScheduleCommands!);
        const schedules = response.map(schedule => {

          // スケジュール情報を整形
          const action = schedule.Target?.Arn?.includes('startInstances') ? 'start' : 'stop';
          
          return {
            name: schedule.Name ? schedule.Name : 'no-name',
            action,
            description: schedule.Description ? schedule.Description : 'No description',
            cronExpression: schedule.ScheduleExpression ? schedule.ScheduleExpression : 'No schedule expression',
            targetInstanceId: params.instanceId
          };
        }) || [];
        
        return schedules;
      },
      {
        serviceName: 'Scheduler',
        operationName: 'listSchedulesForInstance',
        params,
        errorHandler: (error) => {
          return [];
        }
      }
    );
  }
};

// ecsClientの実装
export const ecsClient = {
  // クラスター一覧の取得
  listClusters: async () => {
    return await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new ListClustersCommand({});
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'listClusters',
        errorHandler: (error): ListClustersCommandOutput => {
          return { 
            clusterArns: [],
            $metadata: {}
          };
        }
      }
    );
  },
  
  // サービス一覧の取得
  listServices: async (params: { cluster: string }) => {
    return await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new ListServicesCommand({
          cluster: params.cluster
        });
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'listServices',
        params,
        errorHandler: (error): ListServicesCommandOutput => {
          return { 
            serviceArns: [],
            $metadata: {}
          };
        }
      }
    );
  },
  
  // サービス詳細の取得
  describeServices: async (params: { cluster: string, services: string[] }) => {
    return await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new DescribeServicesCommand({
          cluster: params.cluster,
          services: params.services
        });
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'describeServices',
        params,
        errorHandler: (error): DescribeServicesCommandOutput => {
          return { 
            services: [],
            $metadata: {}
          };
        }
      }
    );
  },
  
  // サービスのタスク数を更新
  updateServiceDesiredCount: async (params: { 
    cluster: string, 
    service: string, 
    desiredCount: number 
  }) => {
    return await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new UpdateServiceCommand({
          cluster: params.cluster,
          service: params.service,
          desiredCount: params.desiredCount
        });
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'updateServiceDesiredCount',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  }
};

// rdsClientの実装
export const rdsClient = {
  // DBクラスター一覧の取得
  describeDBClusters: async () => {
    return await withAWSClient(
      RDSClient,
      async (client) => {
        const command = new DescribeDBClustersCommand({});
        return await client.send(command);
      },
      {
        serviceName: 'RDS',
        operationName: 'describeDBClusters',
        errorHandler: (error): DescribeDBClustersCommandOutput => {
          return { 
            DBClusters: [],
            $metadata: {}
          };
        }
      }
    );
  },
  
  // DBクラスターの一時停止
  stopDBCluster: async (params: { dbClusterIdentifier: string }) => {
    return await withAWSClient(
      RDSClient,
      async (client) => {
        const command = new StopDBClusterCommand({
          DBClusterIdentifier: params.dbClusterIdentifier
        });
        return await client.send(command);
      },
      {
        serviceName: 'RDS',
        operationName: 'stopDBCluster',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // DBクラスターの再開
  startDBCluster: async (params: { dbClusterIdentifier: string }) => {
    return await withAWSClient(
      RDSClient,
      async (client) => {
        const command = new StartDBClusterCommand({
          DBClusterIdentifier: params.dbClusterIdentifier
        });
        return await client.send(command);
      },
      {
        serviceName: 'RDS',
        operationName: 'startDBCluster',
        params
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  }
};

// Cognitoクライアントの初期化

// SECRET_HASHを計算する関数
function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

export const cognitoClient = {
  // パスワードリセットを開始する関数
  forgotPassword: async (params: {username: string, clientId: string, clientSecret: string}): Promise<ForgotPasswordCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        // SECRET_HASHを計算
        const secretHash = calculateSecretHash(params.username, params.clientId, params.clientSecret);
        
        const commandInput: ForgotPasswordCommandInput = {
          ClientId: params.clientId,
          Username: params.username,
          SecretHash: secretHash
        };
        
        const command = new ForgotPasswordCommand(commandInput);
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'forgotPassword',
        params: { username: params.username }
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // パスワードリセットを確認する関数
  confirmForgotPassword: async (params: {
    username: string, 
    confirmationCode: string,
    newPassword: string,
    clientId: string,
    clientSecret: string
  }): Promise<ConfirmForgotPasswordCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        // SECRET_HASHを計算
        const secretHash = calculateSecretHash(params.username, params.clientId, params.clientSecret);
        
        const commandInput: ConfirmForgotPasswordCommandInput = {
          ClientId: params.clientId,
          Username: params.username,
          ConfirmationCode: params.confirmationCode,
          Password: params.newPassword,
          SecretHash: secretHash
        };
        
        const command = new ConfirmForgotPasswordCommand(commandInput);
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'confirmForgotPassword',
        params: { username: params.username }
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },

  // ユーザー情報を取得する関数
  getUser: async (params: {accessToken: string}): Promise<GetUserCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        const command = new GetUserCommand({
          AccessToken: params.accessToken
        });
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'getUser'
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // USER_PASSWORD_AUTH認証を行う関数
  initiateAuth: async (params: {username: string, password: string, clientId: string, clientSecret: string}): Promise<InitiateAuthCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        // SECRET_HASHを計算
        const secretHash = calculateSecretHash(params.username, params.clientId, params.clientSecret);
        
        const commandInput: InitiateAuthCommandInput = {
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          ClientId: params.clientId,
          AuthParameters: {
            USERNAME: params.username,
            PASSWORD: params.password,
            SECRET_HASH: secretHash
          }
        };
        
        const command = new InitiateAuthCommand(commandInput);
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'initiateAuth',
        params: { username: params.username }
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  },
  
  // 新しいパスワードが必要な場合のチャレンジに応答する関数
  respondToNewPasswordChallenge: async (params: {
    username: string, 
    newPassword: string, 
    session: string, 
    clientId: string,
    clientSecret: string
  }): Promise<RespondToAuthChallengeCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        // SECRET_HASHを計算
        const secretHash = calculateSecretHash(params.username, params.clientId, params.clientSecret);
        
        const commandInput: RespondToAuthChallengeCommandInput = {
          ChallengeName: 'NEW_PASSWORD_REQUIRED',
          ClientId: params.clientId,
          Session: params.session,
          ChallengeResponses: {
            USERNAME: params.username,
            NEW_PASSWORD: params.newPassword,
            SECRET_HASH: secretHash
          }
        };
        
        const command = new RespondToAuthChallengeCommand(commandInput);
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'respondToNewPasswordChallenge',
        params: { username: params.username }
        // エラーハンドラーなし（エラーをそのまま投げる）
      }
    );
  }
};
