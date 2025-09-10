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
  LocationType
} from '@aws-sdk/client-ec2';
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand
} from '@aws-sdk/client-ecs';
import {
  RDSClient,
  DescribeDBClustersCommand,
  StopDBClusterCommand,
  StartDBClusterCommand
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
  AdminGetUserCommand,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
  RespondToAuthChallengeCommand,
  RespondToAuthChallengeCommandInput,
  ForgotPasswordCommand,
  ForgotPasswordCommandInput,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
  AuthFlowType
} from '@aws-sdk/client-cognito-identity-provider';
import crypto from 'crypto';

// リージョンの設定
const REGION = process.env.AWS_REGION || 'us-east-1'; // デフォルトは東京リージョン

// AWS SDKのクライアント設定
export const clientConfig = {
  region: REGION,
  // ローカル実行時はclosedtemplateプロファイルを使用
  ...(process.env.NODE_ENV !== 'production' && { profile: 'closedtemplate' })
};

// EC2クライアントの初期化
const ec2 = new EC2Client(clientConfig);

// ECSクライアントの初期化
const ecs = new ECSClient(clientConfig);

// RDSクライアントの初期化
const rds = new RDSClient(clientConfig);

// EventBridge Schedulerクライアントの初期化
const scheduler = new SchedulerClient(clientConfig);
export const ec2Client = {
  describeInstances: async (params: any) => {
    console.log('EC2 describeInstances called with:', params);
    const command = new DescribeInstancesCommand(params);
    try {
      return await ec2.send(command);
    } catch (error) {
      console.error('Error fetching EC2 instances:', error);
      // エラーが発生した場合は空のレスポンスを返す
      return { Reservations: [] };
    }
  },
  startInstance: async (params: { instanceId: string }) => {
    console.log('EC2 startInstances called with:', params);
    const command = new StartInstancesCommand({
      InstanceIds: [params.instanceId]
    });
    try {
      return await ec2.send(command);
    } catch (error) {
      console.error('Error starting EC2 instances:', error);
      // エラーが発生した場合は空のレスポンスを返す
      return { Reservations: [] };
    }
  },
  stopInstance: async (params: { instanceId: string }) => {
    console.log('EC2 stopInstances called with:', params);
    const command = new StopInstancesCommand({
      InstanceIds: [params.instanceId]
    });
    try {
      return await ec2.send(command);
    } catch (error) {
      console.error('Error stopping EC2 instances:', error);
      // エラーが発生した場合は空のレスポンスを返す
      return { Reservations: [] };
    }
  },
  describeInstanceTypes: async (params: { filters?: Array<{ Name: string, Values: string[] }> }): Promise<{InstanceTypes: InstanceTypeInfo[]; NextToken?: string}> => {
    console.log('EC2 describeInstanceTypes called with:', params);
    const command = new DescribeInstanceTypesCommand({
      Filters: params.filters
    });
    try {
      const { InstanceTypes, NextToken } = await ec2.send(command);
      return { 
        InstanceTypes: InstanceTypes ? InstanceTypes : [], 
        NextToken 
      }
    } catch (error) {
      console.error('Error fetching EC2 instance types:', error);
      // エラーが発生した場合は空のレスポンスを返す
      return { InstanceTypes: [],  };
    }
  },
  createTags: async (params: { resourceIds: string[], tags: Array<{ Key: string, Value: string }> }) => {
    console.log('EC2 createTags called with:', params);
    const command = new CreateTagsCommand({
      Resources: params.resourceIds,
      Tags: params.tags
    });
    try {
      return await ec2.send(command);
    } catch (error) {
      console.error('Error creating EC2 tags:', error);
      throw error;
    }
  },
  getInstanceTypesFromInstanceRequirements: async (params: {
    architectureTypes: ArchitectureType[],
    virtualizationTypes: VirtualizationType[],
    instanceRequirements: InstanceRequirementsRequest
  }) => {
    console.log('EC2 getInstanceTypesFromInstanceRequirements called with:', params);
    const command = new GetInstanceTypesFromInstanceRequirementsCommand({
      ArchitectureTypes: params.architectureTypes,
      VirtualizationTypes: params.virtualizationTypes,
      InstanceRequirements: params.instanceRequirements
    });
    try {
      const response = await ec2.send(command);
      return {
        InstanceTypes: response.InstanceTypes || [],
        NextToken: response.NextToken
      };
    } catch (error) {
      console.error('Error fetching EC2 instance types from requirements:', error);
      return { InstanceTypes: [] };
    }
  },
  describeInstanceTypeOfferings: async (params: { 
    filters?: Array<{ Name: string, Values: string[] }>,
    locationType?: LocationType,
  }) => {
    console.log('EC2 describeInstanceTypeOfferings called with:', params);
    const command = new DescribeInstanceTypeOfferingsCommand({
      Filters: params.filters,
      LocationType: params.locationType || 'region',
    });
    try {
      const response = await ec2.send(command);
      return {
        InstanceTypeOfferings: response.InstanceTypeOfferings || [],
        NextToken: response.NextToken
      };
    } catch (error) {
      console.error('Error fetching EC2 instance type offerings:', error);
      return { InstanceTypeOfferings: [] };
    }
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
    console.log('Scheduler createSchedule called with:', params);
    
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
    
    try {
      return await scheduler.send(command);
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw error;
    }
  },
  
  // スケジュールの取得
  getSchedule: async (name: string) => {
    console.log('Scheduler getSchedule called with:', name);
    const command = new GetScheduleCommand({
      Name: name
    });
    
    try {
      return await scheduler.send(command);
    } catch (error) {
      console.error(`Error getting schedule ${name}:`, error);
      throw error;
    }
  },
  
  // スケジュールの更新
  updateSchedule: async (params: {
    name: string;
    instanceId: string;
    action: 'start' | 'stop';
    cronExpression: string;
    description?: string;
  }) => {
    console.log('Scheduler updateSchedule called with:', params);
    
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
    
    try {
      return await scheduler.send(command);
    } catch (error) {
      console.error('Error updating schedule:', error);
      throw error;
    }
  },
  
  // スケジュールの削除
  deleteSchedule: async (name: string) => {
    console.log('Scheduler deleteSchedule called with:', name);
    const command = new DeleteScheduleCommand({
      Name: name
    });
    
    try {
      return await scheduler.send(command);
    } catch (error) {
      console.error(`Error deleting schedule ${name}:`, error);
      throw error;
    }
  },
  
  // インスタンスに関連するスケジュールの一覧取得
  listSchedulesForInstance: async (instanceId: string) => {
    console.log('Scheduler listSchedulesForInstance called with:', instanceId);
    
    // スケジュール名のプレフィックスでフィルタリング
    const command = new ListSchedulesCommand({
      NamePrefix: instanceId
    });
    
    try {
      const listSchedules = await scheduler.send(command);
      console.log(`Schedules: ${JSON.stringify(listSchedules)}`)
      
      const getScheduleCommands = listSchedules.Schedules?.map((schedule: ScheduleSummary) => {
        return scheduler.send(new GetScheduleCommand({
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
          targetInstanceId: instanceId
        };
      }) || [];
      
      return schedules;
    } catch (error) {
      console.error('Error listing schedules:', error);
      return [];
    }
  }
};

// ecsClientの実装
export const ecsClient = {
  // クラスター一覧の取得
  listClusters: async () => {
    console.log('ECS listClusters called');
    const command = new ListClustersCommand({});
    try {
      return await ecs.send(command);
    } catch (error) {
      console.error('Error fetching ECS clusters:', error);
      return { clusterArns: [] };
    }
  },
  
  // サービス一覧の取得
  listServices: async (params: { cluster: string }) => {
    console.log('ECS listServices called with:', params);
    const command = new ListServicesCommand({
      cluster: params.cluster
    });
    try {
      return await ecs.send(command);
    } catch (error) {
      console.error('Error fetching ECS services:', error);
      return { serviceArns: [] };
    }
  },
  
  // サービス詳細の取得
  describeServices: async (params: { cluster: string, services: string[] }) => {
    console.log('ECS describeServices called with:', params);
    const command = new DescribeServicesCommand({
      cluster: params.cluster,
      services: params.services
    });
    try {
      return await ecs.send(command);
    } catch (error) {
      console.error('Error describing ECS services:', error);
      return { services: [] };
    }
  },
  
  // サービスのタスク数を更新
  updateServiceDesiredCount: async (params: { 
    cluster: string, 
    service: string, 
    desiredCount: number 
  }) => {
    console.log('ECS updateService called with:', params);
    const command = new UpdateServiceCommand({
      cluster: params.cluster,
      service: params.service,
      desiredCount: params.desiredCount
    });
    try {
      return await ecs.send(command);
    } catch (error) {
      console.error('Error updating ECS service:', error);
      throw error;
    }
  }
};

// rdsClientの実装
export const rdsClient = {
  // DBクラスター一覧の取得
  describeDBClusters: async () => {
    console.log('RDS describeDBClusters called');
    const command = new DescribeDBClustersCommand({});
    try {
      return await rds.send(command);
    } catch (error) {
      console.error('Error fetching RDS DB clusters:', error);
      return { DBClusters: [] };
    }
  },
  
  // DBクラスターの一時停止
  stopDBCluster: async (params: { dbClusterIdentifier: string }) => {
    console.log('RDS stopDBCluster called with:', params);
    const command = new StopDBClusterCommand({
      DBClusterIdentifier: params.dbClusterIdentifier
    });
    try {
      return await rds.send(command);
    } catch (error) {
      console.error('Error stopping RDS DB cluster:', error);
      throw error;
    }
  },
  
  // DBクラスターの再開
  startDBCluster: async (params: { dbClusterIdentifier: string }) => {
    console.log('RDS startDBCluster called with:', params);
    const command = new StartDBClusterCommand({
      DBClusterIdentifier: params.dbClusterIdentifier
    });
    try {
      return await rds.send(command);
    } catch (error) {
      console.error('Error starting RDS DB cluster:', error);
      throw error;
    }
  }
};

// Cognitoクライアントの初期化
const cognitoIdp = new CognitoIdentityProviderClient(clientConfig);

// SECRET_HASHを計算する関数
function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

export const cognitoClient = {
  // パスワードリセットを開始する関数
  forgotPassword: async (username: string, clientId: string, clientSecret: string): Promise<any> => {
    console.log(`Initiating password reset for user: ${username}`);
    
    try {
      // SECRET_HASHを計算
      const secretHash = calculateSecretHash(username, clientId, clientSecret);
      
      const params: ForgotPasswordCommandInput = {
        ClientId: clientId,
        Username: username,
        SecretHash: secretHash
      };
      
      const command = new ForgotPasswordCommand(params);
      const response = await cognitoIdp.send(command);
      
      return response;
    } catch (error) {
      console.error(`Error during password reset for user ${username}:`, error);
      throw error;
    }
  },
  
  // パスワードリセットを確認する関数
  confirmForgotPassword: async (
    username: string, 
    confirmationCode: string,
    newPassword: string,
    clientId: string,
    clientSecret: string
  ): Promise<any> => {
    console.log(`Confirming password reset for user: ${username}`);
    
    try {
      // SECRET_HASHを計算
      const secretHash = calculateSecretHash(username, clientId, clientSecret);
      
      const params: ConfirmForgotPasswordCommandInput = {
        ClientId: clientId,
        Username: username,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
        SecretHash: secretHash
      };
      
      const command = new ConfirmForgotPasswordCommand(params);
      const response = await cognitoIdp.send(command);
      
      return response;
    } catch (error) {
      console.error(`Error during password reset confirmation for user ${username}:`, error);
      throw error;
    }
  },

  // ユーザー情報を取得する関数
  getUser: async (username: string, userPoolId: string): Promise<any> => {
    console.log(`Getting user info for: ${username} in user pool: ${userPoolId}`);

    try {
      const command = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username
      });

      return await cognitoIdp.send(command);
    } catch (error) {
      console.error(`Error getting user ${username}:`, error);
      return null;
    }
  },
  
  // USER_PASSWORD_AUTH認証を行う関数
  initiateAuth: async (username: string, password: string, clientId: string, clientSecret: string): Promise<any> => {
    console.log(`Initiating auth for user: ${username}`);
    
    try {
      // SECRET_HASHを計算
      const secretHash = calculateSecretHash(username, clientId, clientSecret);
      
      const params: InitiateAuthCommandInput = {
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
          SECRET_HASH: secretHash
        }
      };
      
      const command = new InitiateAuthCommand(params);
      const response = await cognitoIdp.send(command);
      
      return response;
    } catch (error) {
      console.error(`Error during authentication for user ${username}:`, error);
      throw error;
    }
  },
  
  // 新しいパスワードが必要な場合のチャレンジに応答する関数
  respondToNewPasswordChallenge: async (
    username: string, 
    newPassword: string, 
    session: string, 
    clientId: string,
    clientSecret: string
  ): Promise<any> => {
    console.log(`Responding to new password challenge for user: ${username}`);
    
    try {
      // SECRET_HASHを計算
      const secretHash = calculateSecretHash(username, clientId, clientSecret);
      
      const params: RespondToAuthChallengeCommandInput = {
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: clientId,
        Session: session,
        ChallengeResponses: {
          USERNAME: username,
          NEW_PASSWORD: newPassword,
          SECRET_HASH: secretHash
        }
      };
      
      const command = new RespondToAuthChallengeCommand(params);
      const response = await cognitoIdp.send(command);
      
      return response;
    } catch (error) {
      console.error(`Error during new password challenge for user ${username}:`, error);
      throw error;
    }
  }
};
