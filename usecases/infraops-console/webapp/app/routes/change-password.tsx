import { Form, useActionData, useNavigation } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getSession, commitSession } from '~/utils/session.server';
import { Button, Input, Label, RequirementBadge } from '~/components';
import { cognitoClient } from '~/utils/aws.server';
import { getCognitoConfig } from '~/utils/auth.server';
import { verifyAndDecodeIdToken } from '~/utils/jwt-verify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Check session
  const session = await getSession(request.headers.get('Cookie'));
  const challengeName = session.get('challengeName');
  
  // Redirect to login page if no challenge
  if (challengeName !== 'NEW_PASSWORD_REQUIRED') {
    return redirect('/login');
  }
  
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const newPassword = form.get('newPassword') as string;
  const confirmPassword = form.get('confirmPassword') as string;
  
  // Password validation
  if (!newPassword || !confirmPassword) {
    return { error: '新しいパスワードを入力してください。' };
  }
  
  if (newPassword !== confirmPassword) {
    return { error: 'パスワードが一致しません。' };
  }
  
  try {
    // Get session
    const session = await getSession(request.headers.get('Cookie'));
    const challengeSession = session.get('challengeSession');
    const email = session.get('challengeEmail');
    
    if (!challengeSession || !email) {
      return redirect('/login');
    }
    
    // Get OAuth2 configuration
    const config = getCognitoConfig();
    
    // Respond to password challenge
    const response = await cognitoClient.respondToNewPasswordChallenge({
      username: email,
      newPassword,
      session: challengeSession,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });
    
    // If authentication is successful
    if (response.AuthenticationResult) {
      
      // Save tokens and user information to session
      session.unset('challengeName');
      session.unset('challengeSession');
      session.unset('challengeEmail');
      
      // Save only ID and Access tokens
      session.set('idToken', response.AuthenticationResult.IdToken);
      session.set('accessToken', response.AuthenticationResult.AccessToken);

      const idToken = response.AuthenticationResult.IdToken;
      if (idToken) {
        try {
          const payload = await verifyAndDecodeIdToken(idToken);
          const groups = payload['cognito:groups'] as string[] || [];
          session.set('user', {
            email: payload.email as string,
            isAdmin: groups.includes('Admins'),
            groupId: payload['custom:groupId'] as string || null,
            groups: groups
          });
        } catch (error) {
          console.error('Failed to decode ID token during login:', error);
          // Use fallback user info if token decoding fails
        }
      }
      
      // Commit session
      const sessionCookie = await commitSession(session, {
        expires: new Date(Date.now() + 60 * 60 * 1000) // Valid for 1 hour (align with token expiry)
      });
      
      // Redirect to dashboard
      return redirect('/dashboard', {
        headers: {
          'Set-Cookie': sessionCookie
        }
      });
    }
    
    return { error: 'パスワードの変更に失敗しました。もう一度お試しください。' };
  } catch (error: any) {
    console.error('Password change error:', error);
    
    return {
      error: 'パスワードの変更に失敗しました。もう一度お試しください。',
    };
  }
}

export default function ChangePassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  return (
    <div className="login-container">
      <h1>パスワードの変更</h1>
      <p>新しいパスワードを設定してください</p>
      
      <Form method="post">
        {actionData && 'error' in actionData && (
          <div className="error-message">{actionData.error}</div>
        )}
        
        <div className="flex flex-col items-start gap-2 form-group">
          <Label htmlFor=":r1:">
            新しいパスワード
            <RequirementBadge>
              ※必須
            </RequirementBadge>
          </Label>
          <Input
            aria-describedby=":r2:"
            blockSize="lg"
            placeholder="新しいパスワード"
            id=":r2:"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className="form-control w-full"
          />
        
          <Label htmlFor=":r3:">
            パスワードの確認
            <RequirementBadge>
              ※必須
            </RequirementBadge>
          </Label>
          <Input
            aria-describedby=":r4:"
            blockSize="lg"
            placeholder="パスワードの確認"
            id=":r4:"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="form-control w-full"
          />
        </div>
        
        <Button 
          type="submit" 
          disabled={isSubmitting}
          size="lg"
          variant="solid-fill"
        >
          {isSubmitting ? '処理中...' : 'パスワードを変更'}
        </Button>
      </Form>
    </div>
  );
}
