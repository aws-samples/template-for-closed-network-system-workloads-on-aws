
import { getCognitoConfig } from '~/utils/auth.server';
import { 
  AdminCreateUserCommand, 
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  AttributeType
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

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

// Initialize Cognito client
const config = getCognitoConfig();
const cognitoIdp = new CognitoIdentityProviderClient({
  region: config.region,
  ...(process.env.NODE_ENV !== 'production' && { profile: 'closedtemplate' })
});

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
 * Search user by email address
 * @param email Email address
 * @returns User information, null if not found
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const command = new AdminGetUserCommand({
      UserPoolId: config.userPoolId,
      Username: email
    });
    
    const userResponse = await cognitoIdp.send(command);
    
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
    
    // Set user attributes
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:isAdmin', Value: isAdmin ? 'true' : 'false' }
    ];
    
    // Add if group ID is specified
    if (groupId) {
      userAttributes.push({ Name: 'custom:groupId', Value: groupId });
    }
    
    // Generate temporary password (random string)
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    
    // Create user
    const command = new AdminCreateUserCommand({
      UserPoolId: config.userPoolId,
      Username: email,
      UserAttributes: userAttributes,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS' // Suppress email sending (change as needed)
    });
    
    await cognitoIdp.send(command);
    
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
    const command = new AdminDeleteUserCommand({
      UserPoolId: config.userPoolId,
      Username: email
    });
    
    await cognitoIdp.send(command);
  } catch (error) {
    console.error('Error deleting user from Cognito:', error);
    throw new Error('Failed to delete user');
  }
}
