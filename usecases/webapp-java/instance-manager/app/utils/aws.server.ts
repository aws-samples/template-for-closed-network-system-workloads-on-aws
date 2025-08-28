// AWS SDKの実装
import { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StartInstancesCommandInput, StopInstancesCommand } from '@aws-sdk/client-ec2';
import { 
  SecretsManagerClient, 
  GetSecretValueCommand,
  UpdateSecretCommand 
} from '@aws-sdk/client-secrets-manager';
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
      console.error('Error fetching EC2 instances:', error);
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
      console.error('Error fetching EC2 instances:', error);
      // エラーが発生した場合は空のレスポンスを返す
      return { Reservations: [] };
    }
  }
};

// SecretsManagerクライアントの初期化
const secretsManager = new SecretsManagerClient(clientConfig);

export const smClient = {
  // SecretsManagerからシークレットを取得する関数
  getSecret: async (secretName: string): Promise<any> =>  {
    console.log(`Getting secret for: ${secretName}`);

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await secretsManager.send(command);

      if (response.SecretString) {
        return JSON.parse(response.SecretString);
      }

      return null;
    } catch (error) {
      console.error(`Error getting secret ${secretName}:`, error);

      // 開発環境用のフォールバック値
      if (process.env.NODE_ENV !== 'production') {
        if (secretName === 'oauth2-secret') {
          return {
            clientId: 'mock-client-id',
            clientSecret: 'mock-client-secret',
            userPoolId: 'mock-user-pool-id',
            domain: 'mock-domain',
            region: 'us-east-1'
          };
        } else if (secretName === 'instance-manager/users') {
          return {
            users: [
              {
                email: 'admin@example.com',
                role: 'admin',
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      }

      return null;
    }
  },
  // SecretsManagerにシークレットを保存する関数
  putSecret: async (secretName: string, secretValue: any): Promise<void> => {
    console.log(`Updating secret for: ${secretName}`);

    try {
      const command = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(secretValue),
      });

      await secretsManager.send(command);
    } catch (error) {
      console.error(`Error updating secret ${secretName}:`, error);

      // 開発環境の場合はエラーを無視
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
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
