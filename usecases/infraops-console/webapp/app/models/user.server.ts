import { cognitoClient } from '~/utils/aws.server';
import { AttributeType } from '@aws-sdk/client-cognito-identity-provider';

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
 * Create user object from Cognito user attributes
 * @param userAttributes Cognito user attributes
 * @returns User object
 */
function mapCognitoUserToUser(userAttributes: AttributeType[]): User {
  let email = '';
  let groupId: string | null = null;
  let isAdmin = false;
  let createdAt = new Date().toISOString();

  // Extract necessary information from attributes
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
 * Get user list
 * @param limit Maximum number of items to retrieve (optional)
 * @param lastEvaluatedKey Starting key (for pagination, optional)
 * @returns User list
 */
export async function getUsers(
  limit?: number,
  lastEvaluatedKey?: Record<string, any>
): Promise<UserList> {
  try {
    const response = await cognitoClient.listUsers({
      limit: limit || 60,
      paginationToken: lastEvaluatedKey?.token
    });
    
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
 * Search user by email address
 * @param email Email address
 * @returns User information, null if not found
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const userResponse = await cognitoClient.getUserByEmail({ email });
    
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
 * Add user
 * @param userData User data
 * @returns Added user information
 */
export async function addUser(userData: {
  email: string;
  isAdmin?: boolean;
  groupId?: string | null;
}): Promise<User> {
  try {
    const { email, isAdmin = false, groupId } = userData;
    
    await cognitoClient.createUser({
      email,
      isAdmin,
      groupId
    });
    
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
export async function deleteUser(email: string): Promise<void> {
  try {
    await cognitoClient.deleteUser({ email });
  } catch (error) {
    console.error('Error deleting user from Cognito:', error);
    throw new Error('Failed to delete user');
  }
}
