import { cognitoClient } from '~/utils/aws.server';
import { AttributeType, UserType } from '@aws-sdk/client-cognito-identity-provider';

// User type definition
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

/**
 * Create user object from Cognito UserType
 * @param cognitoUser Cognito UserType object
 * @param groups User's Cognito groups (optional)
 * @returns User object
 */
function mapCognitoUserToUser(cognitoUser: UserType, groups?: string[]): User {
  const userAttributes = cognitoUser.Attributes || [];
  
  let email = '';
  let groupId: string | null = null;
  
  // Cognitoの標準的な作成日時を使用（UserCreateDate）
  let createdAt = cognitoUser.UserCreateDate 
    ? cognitoUser.UserCreateDate.toISOString() 
    : new Date().toISOString();

  // Extract necessary information from attributes
  userAttributes.forEach(attr => {
    if (attr.Name === 'email') {
      email = attr.Value || '';
    } else if (attr.Name === 'custom:groupId') {
      groupId = attr.Value || null;
    } 
    // カスタム属性のcreatedAtがあれば優先（後方互換性のため）
    else if (attr.Name === 'custom:createdAt') {
      createdAt = attr.Value || createdAt;
    }
  });

  // Determine admin status from groups
  const isAdmin = groups ? groups.includes('Admins') : false;

  return {
    email,
    groupId,
    createdAt,
    isAdmin
  };
}

/**
 * Get user list
 * @param limit Maximum number of items to retrieve (optional)
 * @param lastEvaluatedKey Starting key (for pagination, optional)
 * @returns User list
 */
export async function getUsers(
  params: {
    limit?: number,
    lastEvaluatedKey?: Record<string, any>,
  },
  request: Request,
): Promise<UserList> {
  try {
    const { limit, lastEvaluatedKey } = params;
    const response = await cognitoClient.listUsers({
      limit: limit || 60,
      paginationToken: lastEvaluatedKey?.token
    }, request);
    
    const users = await Promise.all(
      (response.Users || []).map(async (cognitoUser) => {
        const attributes = cognitoUser.Attributes || [];
        const email = attributes.find(attr => attr.Name === 'email')?.Value;
        
        // Get user's groups
        let groups: string[] = [];
        if (email) {
          try {
            const groupsResponse = await cognitoClient.getUserGroups({ email }, request);
            groups = groupsResponse.groups || [];
          } catch (error) {
            console.error(`Error getting groups for user ${email}:`, error);
          }
        }
        
        // CognitoのUserType全体を渡す
        return mapCognitoUserToUser(cognitoUser, groups);
      })
    );

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
 * Search user by email address
 * @param email Email address
 * @returns User information, null if not found
 */
export async function getUserByEmail(email: string, request: Request): Promise<User | null> {
  try {
    const userResponse = await cognitoClient.getUserByEmail({ email }, request);
    
    if (!userResponse || !userResponse.UserAttributes) {
      return null;
    }
    
    // AdminGetUserCommandOutputからUserTypeに変換
    const cognitoUser: UserType = {
      Attributes: userResponse.UserAttributes,
      UserCreateDate: userResponse.UserCreateDate,
      Username: userResponse.Username,
      UserStatus: userResponse.UserStatus,
      Enabled: userResponse.Enabled
    };
    
    return mapCognitoUserToUser(cognitoUser);
  } catch (error) {
    console.error('Error getting user by email from Cognito:', error);
    return null;
  }
}

/**
 * Add user
 * @param userData User data
 * @returns Added user information
 */
export async function addUser(userData: {
  email: string;
  isAdmin?: boolean;
  groupId?: string | null;
}, request: Request): Promise<User> {
  try {
    const { email, isAdmin = false, groupId } = userData;
    
    await cognitoClient.createUser({
      email,
      isAdmin,
      groupId
    }, request);
    
    // Return created user information
    return {
      email,
      groupId: groupId || null,
      createdAt: new Date().toISOString(),
      isAdmin: isAdmin || false
    };
  } catch (error) {
    console.error('Error adding user to Cognito:', error);
    throw new Error('Failed to add user');
  }
}

/**
 * Delete user
 * @param email Email address
 */
export async function deleteUser(email: string, request: Request): Promise<void> {
  try {
    await cognitoClient.deleteUser({ email }, request);
  } catch (error) {
    console.error('Error deleting user from Cognito:', error);
    throw new Error('Failed to delete user');
  }
}
