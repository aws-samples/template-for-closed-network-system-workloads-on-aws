
import { cognitoClient } from '~/utils/aws.server';
import { getCognitoConfig } from '~/utils/auth.server';
import { 
  AdminCreateUserCommand, 
  AdminDeleteUserCommand,
  ListUsersCommand,
  AttributeType
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

// ユーザー型の定義
export type User = {
  email: string;
  groupId?: string | null;
  createdAt: string;
  isAdmin: boolean;
};

export type UserList = {
  users: User[];
  lastEvaluatedKey?: Record<string, any>;
};

// Cognitoクライアントの初期化
const config = getCognitoConfig();
const cognitoIdp = new CognitoIdentityProviderClient({
  region: config.region,
  ...(process.env.NODE_ENV !== 'production' && { profile: 'closedtemplate' })
});

/**
 * Cognitoユーザー属性からユーザーオブジェクトを作成
 * @param userAttributes Cognitoユーザー属性
 * @returns ユーザーオブジェクト
 */
function mapCognitoUserToUser(userAttributes: AttributeType[]): User {
  let email = '';
  let groupId: string | null = null;
  let isAdmin = false;
  let createdAt = new Date().toISOString();

  // 属性から必要な情報を抽出
  userAttributes.forEach(attr => {
    if (attr.Name === 'email') {
      email = attr.Value || '';
    } else if (attr.Name === 'custom:groupId') {
      groupId = attr.Value || null;
    } else if (attr.Name === 'custom:isAdmin') {
      isAdmin = attr.Value === 'true';
    } else if (attr.Name === 'createdAt') {
      createdAt = attr.Value || new Date().toISOString();
    }
  });

  return {
    email,
    groupId,
    createdAt,
    isAdmin
  };
}

/**
 * ユーザー一覧を取得
 * @param limit 取得件数の上限（オプション）
 * @param lastEvaluatedKey 開始キー（ページネーション用、オプション）
 * @returns ユーザーリスト
 */
export async function getUsers(
  limit?: number,
  lastEvaluatedKey?: Record<string, any>
): Promise<UserList> {
  try {
    const command = new ListUsersCommand({
      UserPoolId: config.userPoolId,
      Limit: limit || 60,
      ...(lastEvaluatedKey?.token && { PaginationToken: lastEvaluatedKey.token })
    });

    const response = await cognitoIdp.send(command);
    
    const users = response.Users?.map(user => {
      const attributes = user.Attributes || [];
      return mapCognitoUserToUser(attributes);
    }) || [];

    return {
      users,
      lastEvaluatedKey: response.PaginationToken ? { token: response.PaginationToken } : undefined
    };
  } catch (error) {
    console.error('Error getting users from Cognito:', error);
    return { users: [] };
  }
}

/**
 * メールアドレスでユーザーを検索
 * @param email メールアドレス
 * @returns ユーザー情報、存在しない場合はnull
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const userResponse = await cognitoClient.getUser(email, config.userPoolId);
    
    if (!userResponse || !userResponse.UserAttributes) {
      return null;
    }
    
    return mapCognitoUserToUser(userResponse.UserAttributes);
  } catch (error) {
    console.error('Error getting user by email from Cognito:', error);
    return null;
  }
}

/**
 * ユーザーを追加
 * @param userData ユーザーデータ
 * @returns 追加されたユーザー情報
 */
export async function addUser(userData: {
  email: string;
  isAdmin?: boolean;
  groupId?: string | null;
}): Promise<User> {
  try {
    const { email, isAdmin = false, groupId } = userData;
    
    // ユーザー属性の設定
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:isAdmin', Value: isAdmin ? 'true' : 'false' }
    ];
    
    // グループIDが指定されている場合は追加
    if (groupId) {
      userAttributes.push({ Name: 'custom:groupId', Value: groupId });
    }
    
    // 一時パスワードの生成（ランダムな文字列）
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    
    // ユーザーの作成
    const command = new AdminCreateUserCommand({
      UserPoolId: config.userPoolId,
      Username: email,
      UserAttributes: userAttributes,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS' // メール送信を抑制（必要に応じて変更）
    });
    
    await cognitoIdp.send(command);
    
    // 作成したユーザー情報を返す
    return {
      email,
      groupId: groupId || null,
      createdAt: new Date().toISOString(),
      isAdmin: isAdmin || false
    };
  } catch (error) {
    console.error('Error adding user to Cognito:', error);
    throw new Error('ユーザーの追加に失敗しました');
  }
}

/**
 * ユーザーを削除
 * @param email メールアドレス
 */
export async function deleteUser(email: string): Promise<void> {
  try {
    const command = new AdminDeleteUserCommand({
      UserPoolId: config.userPoolId,
      Username: email
    });
    
    await cognitoIdp.send(command);
  } catch (error) {
    console.error('Error deleting user from Cognito:', error);
    throw new Error('ユーザーの削除に失敗しました');
  }
}
