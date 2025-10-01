import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';
import { commitSession, getSession } from './session.server';
import { User } from '~/models/user.server';
import { redirect } from '@remix-run/node';
import { cognitoClient } from './aws.server';

// User type definition
export type AuthUser = {
  email: string;
} | null;

// Create Authenticator
export const authenticator = new Authenticator<AuthUser>();

// Function to get Cognito configuration
export function getCognitoConfig() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const userPoolId = process.env.USER_POOL_ID;
  const domain = process.env.DOMAIN;
  const region = process.env.AWS_REGION;  

  if (!clientId || !clientSecret || !userPoolId || !domain || !region) {
    throw new Error('Cognito configuration not found');
  }
  
  return {
    clientId,
    clientSecret,
    userPoolId,
    domain,
    region
  };
}

// FormStrategy initialization function
async function initFormStrategy() {
  try {
    // Get OAuth2 configuration
    const config = getCognitoConfig();
    
    // FormStrategy configuration
    authenticator.use(
      new FormStrategy(async ({ form, request }) => {
        // Get username and password from form
        const email = form.get('email') as string;
        const password = form.get('password') as string;
        
        if (!email || !password) {
          throw new Error('メールアドレスとパスワードは必須です');
        }
        
        let authResult;
        try {
          // Execute ADMIN_USER_PASSWORD_AUTH authentication
          authResult = await cognitoClient.initiateAuth({
            username: email,
            password,
            clientId: config.clientId,
            clientSecret: config.clientSecret
          });
        } catch (error: any) {
          console.error('Authentication error:', error);
          
          // Handle errors based on error type
          if (error.name === 'UserNotConfirmedException') {
            // When user is not confirmed
            throw redirect('/error');
          } else if (error.name === 'NotAuthorizedException') {
            // In case of authentication error
            throw new Error('メールアドレスまたはパスワードが正しくありません');
          } else if (error.name === 'UserNotFoundException') {
            // When user does not exist
            throw new Error('ユーザーが存在しません');
          } else {
            // Other errors
            throw new Error('認証に失敗しました');
          }
        }
          
        if (authResult.ChallengeName === "NEW_PASSWORD_REQUIRED" && authResult.ChallengeParameters) {
          // Save challenge information to session
          const session = await getSession(request.headers.get('Cookie'));
          session.set('challengeName', authResult.ChallengeName);
          session.set('challengeSession', authResult.Session);
          session.set('challengeEmail', JSON.parse(authResult.ChallengeParameters.userAttributes).email);

          throw redirect('/change-password', {
            headers: {
              'Set-Cookie': await commitSession(session, {
                expires: new Date(Date.now() + 300000) // Valid for 5 minutes
              })
            }
          });
        } 
        // Save both ID token and user information to session
        const session = await getSession(request.headers.get('Cookie'));
    
        // Save ID token
        console.log(`Storing ID Token in session: ${authResult.AuthenticationResult?.IdToken}`)
        session.set('idToken', authResult.AuthenticationResult?.IdToken);

        // Also save user information
        session.set('user', {
          email: email,
          // Add other attributes as needed
        });
    
        // Commit session and redirect to dashboard
        throw redirect('/dashboard', {
          headers: {
            'Set-Cookie': await commitSession(session, {
              expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // Valid for 1 day
            })
          }
        });
      }),
      'form'
    );
    
    console.log('Form strategy initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Form strategy:', error);
  }
}

// Execute initialization function
initFormStrategy().catch(error => {
  console.error('Failed to initialize Form strategy:', error);
});

// Admin permission check
export async function requireAdmin(request: Request) {
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  
  // Error if no user information
  if (!user) {
    throw redirect('/login');
  }
  
  // Check if Cognito custom attribute isAdmin is True
  const isAdmin = user.isAdmin === true;
  
  if (!isAdmin) {
    throw new Response('Forbidden', { status: 403 });
  }
  
  return user;
}

// Login status check
export async function isAuthenticated(request: Request):Promise<void> {
  const session = await getSession(request.headers.get('Cookie'));
  const user:User = session.get('user');
  
  if (!user) {
    throw redirect('/login');
  }
}

// ID token validation is performed on the AWS side when obtaining temporary credentials, so only token existence check is performed here
export async function requireAuthentication(request: Request): Promise<{idToken: string, user: User}> {
  const session = await getSession(request.headers.get('Cookie'));
  const user:User = session.get('user');
  const idToken = session.get('idToken');
  
  if (!idToken) {
    console.log('No ID token found in session, redirecting to login');
    throw redirect('/login');
  }
  
  return {idToken, user};
}
