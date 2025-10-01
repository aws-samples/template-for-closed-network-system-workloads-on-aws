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
} from '@aws-sdk/client-ec2';
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import {
  RDSClient,
  DescribeDBClustersCommand,
  StopDBClusterCommand,
  StartDBClusterCommand,
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
  ScheduleSummary,
  TagResourceCommand,
  ListTagsForResourceCommand,
  Tag
} from '@aws-sdk/client-scheduler';
import { 
  CognitoIdentityProviderClient,
  GetUserCommand,
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
  AdminInitiateAuthCommand,
  AdminInitiateAuthCommandInput,
  AdminInitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import crypto from 'crypto';
import { fromIni } from "@aws-sdk/credential-providers";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity"
import { requireAuthentication } from '~/utils/auth.server';
import { createAppError } from '~/utils/error.server';
import { filterByGroupId, extractEC2Tags, extractRDSTags, extractECSTags } from '~/utils/abac-filter.server';
import { getVerifiedGroupId } from './jwt-verify.server';

// リージョンの設定
const REGION = process.env.AWS_REGION || 'ap-northeast-1'; // デフォルトは東京リージョン

// AWS SDKのクライアント設定
const makeClientConfig = async (request?: Request) => {
  const idToken = request ? (await requireAuthentication(request)).idToken : undefined;
  return {
    region: REGION,
    credentials: (process.env.NODE_ENV === "development") 
    // 本番環境
    ? (request ? fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: REGION }),
      identityPoolId: process.env.IDENTITY_POOL_ID || '',
      logins: idToken ? {[`cognito-idp.${REGION}.amazonaws.com/${process.env.USER_POOL_ID}`]: idToken} : undefined
      // request がない場合はApp Runnerの権限を利用する
    }) : fromIni({ profile: 'closedtemplate' })) 
    // 開発環境のみ
    :fromIni({ profile: 'closedtemplate' }),
  }
};

// AWS SDKクライアントの共通インターフェース
interface AWSClient {
  destroy(): void;
}

// AWS SDKクライアントのコンストラクタ型
type AWSClientConstructor<T extends AWSClient> = new (config: any) => T;

// 汎用的なAWSクライアント高階関数（統一されたエラーハンドリング付き）
const withAWSClient = async <TClient extends AWSClient, TResult>(
  ClientClass: AWSClientConstructor<TClient>,
  operation: (client: TClient) => Promise<TResult>,
  options: {
    serviceName: string;
    operationName: string;
    params?: any;
    request?: Request;
  }
): Promise<TResult> => {
  const client = new ClientClass(await makeClientConfig(options.request));
  const { serviceName, operationName, params } = options;
  
  console.log(`${serviceName} ${operationName} called${params ? ' with:' : ''}`, params || '');
  
  try {
    return await operation(client);
  } catch (error) {
    console.error(`Error in ${serviceName} ${operationName}:`, error);
    
    // 統一されたエラーメッセージを作成してthrow
    const message = `${serviceName}の${operationName}処理中にエラーが発生しました`;
    throw createAppError(message, error);
  } finally {
    client.destroy();
  }
};

export const ec2Client = {
  describeInstances: async (params: DescribeInstancesCommandInput, request: Request) => {
    const result = await withAWSClient(
      EC2Client,
      async (client) => {
        const command = new DescribeInstancesCommand(params);
        return await client.send(command);
      },
      {
        serviceName: 'EC2',
        operationName: 'describeInstances',
        params,
        request
      }
    );

    // ABACフィルタリングを適用（Reservationsの中のInstancesをフィルタリング）
    const filteredReservations = await Promise.all(
      (result.Reservations || []).map(async (reservation) => {
        const filteredInstances = await filterByGroupId(
          reservation.Instances || [],
          extractEC2Tags,
          request
        );
        return { ...reservation, Instances: filteredInstances };
      })
    );

    // 空のReservationを除外
    const nonEmptyReservations = filteredReservations.filter(
      reservation => reservation.Instances && reservation.Instances.length > 0
    );

    return { ...result, Reservations: nonEmptyReservations };
  },

  startInstance: async (params: { instanceId: string }, request: Request) => {
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
        request
      }
    );
  },

  stopInstance: async (params: { instanceId: string }, request: Request) => {
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
        request
      }
    );
  },

  describeInstanceTypes: async (params: { filters?: Array<{ Name: string, Values: string[] }> }, request: Request): Promise<{InstanceTypes: InstanceTypeInfo[]; NextToken?: string}> => {
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
        request
      }
    );
  },

  createTags: async (params: { resourceIds: string[], tags: Array<{ Key: string, Value: string }> }, request: Request) => {
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
        params,
        request
        
      }
    );
  },

  getInstanceTypesFromInstanceRequirements: async (params: {
    architectureTypes: ArchitectureType[],
    virtualizationTypes: VirtualizationType[],
    instanceRequirements: InstanceRequirementsRequest
  }, request: Request) => {
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
        request
      }
    );
  },

  describeInstanceTypeOfferings: async (params: { 
    filters?: Array<{ Name: string, Values: string[] }>,
    locationType?: LocationType,
  }, request: Request) => {
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
        request
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
  }, request: Request) => {
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
        
        const result = await client.send(command);

        // スケジュールに対してGroupIdタグを付与
        const groupId = await getVerifiedGroupId(request); 
        const tagResourceCommand = new TagResourceCommand({
          ResourceArn: result.ScheduleArn,
          Tags: [{
            Key: 'GroupId',
            Value: groupId
          }]
        });
        await client.send(tagResourceCommand);

        return result;
      },
      {
        serviceName: 'Scheduler',
        operationName: 'createSchedule',
        params,
        request,
        
      }
    );
  },
  
  // スケジュールの取得
  getSchedule: async (params: {name: string}, request: Request) => {
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
        params,
        request,
        
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
  }, request: Request) => {
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
        operationName: 'updateSchedule',
        params,
        request,
        
      }
    );
  },
  
  // スケジュールの削除
  deleteSchedule: async (params: {name: string}, request: Request) => {
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
        params,
        request,
        
      }
    );
  },
  
  // インスタンスに関連するスケジュールの一覧取得
  listSchedulesForInstance: async (params:{instanceId: string}, request: Request) => {
    return await withAWSClient(
      SchedulerClient,
      async (client) => {
        // スケジュール名のプレフィックスでフィルタリング
        const command = new ListSchedulesCommand({
          NamePrefix: params.instanceId
        });
        
        const listSchedules = await client.send(command);
        console.log(`Schedules: ${JSON.stringify(listSchedules.Schedules?.map(s => s.Name).join(', '))}`);
        
        // フィルタリング後のスケジュールに対してのみ詳細情報を取得
        const getScheduleCommands = listSchedules.Schedules!.map((schedule: ScheduleSummary) => {
          return client.send(new GetScheduleCommand({
            Name: schedule.Name!,
            GroupName: schedule.GroupName!
          }));
        });

        const response = await Promise.all(getScheduleCommands);
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
        request
      }
    );
  }
};

// ecsClientの実装
export const ecsClient = {
  // クラスター一覧の取得
  listClusters: async (request: Request) => {
    return await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new ListClustersCommand({});
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'listClusters',
        request
      }
    );
  },
  
  // サービス一覧の取得
  listServices: async (params: { cluster: string }, request: Request) => {
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
        request
      }
    );
  },
  
  // サービス詳細の取得（ABACフィルタリング適用）
  describeServices: async (params: { cluster: string, services: string[] }, request: Request) => {
    const result = await withAWSClient(
      ECSClient,
      async (client) => {
        const command = new DescribeServicesCommand({
          cluster: params.cluster,
          services: params.services,
          include: [
            "TAGS",
          ],
        });
        return await client.send(command);
      },
      {
        serviceName: 'ECS',
        operationName: 'describeServices',
        params,
        request
      }
    );

    // ABACフィルタリングを適用
    const filteredServices = await filterByGroupId(
      result.services || [],
      extractECSTags,
      request
    );

    return { ...result, services: filteredServices };
  },
  
  // サービスのタスク数を更新
  updateServiceDesiredCount: async (params: { 
    cluster: string, 
    service: string, 
    desiredCount: number 
  }, request: Request) => {
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
        params,
        request
      }
    );
  }
};

// rdsClientの実装
export const rdsClient = {
  // DBクラスター一覧の取得（ABACフィルタリング適用）
  describeDBClusters: async (request: Request) => {
    const result = await withAWSClient(
      RDSClient,
      async (client) => {
        const command = new DescribeDBClustersCommand({});
        return await client.send(command);
      },
      {
        serviceName: 'RDS',
        operationName: 'describeDBClusters',
        request
      }
    );

    // ABACフィルタリングを適用
    const filteredClusters = await filterByGroupId(
      result.DBClusters || [],
      extractRDSTags,
      request
    );

    return { ...result, DBClusters: filteredClusters };
  },
  
  // DBクラスターの一時停止
  stopDBCluster: async (params: { dbClusterIdentifier: string }, request: Request) => {
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
        params,
        request,
        
      }
    );
  },
  
  // DBクラスターの再開
  startDBCluster: async (params: { dbClusterIdentifier: string }, request: Request) => {
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
        params,
        request,
        
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
        
      }
    );
  },
  
  // USER_PASSWORD_AUTH認証を行う関数
  initiateAuth: async (params: {username: string, password: string, clientId: string, clientSecret: string}): Promise<AdminInitiateAuthCommandOutput> => {
    return await withAWSClient(
      CognitoIdentityProviderClient,
      async (client) => {
        // SECRET_HASHを計算
        const secretHash = calculateSecretHash(params.username, params.clientId, params.clientSecret);
        
        const commandInput: AdminInitiateAuthCommandInput = {
          UserPoolId: process.env.USER_POOL_ID!,
          AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
          ClientId: params.clientId,
          AuthParameters: {
            USERNAME: params.username,
            PASSWORD: params.password,
            SECRET_HASH: secretHash
          }
        };
        
        const command = new AdminInitiateAuthCommand(commandInput);
        return await client.send(command);
      },
      {
        serviceName: 'Cognito',
        operationName: 'initiateAuth',
        params: { username: params.username }
        
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
        
      }
    );
  }
};
