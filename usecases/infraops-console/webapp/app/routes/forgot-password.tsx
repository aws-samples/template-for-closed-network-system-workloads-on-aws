import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getSession, commitSession } from '../utils/session.server';
import { Button, Input, Label, RequirementBadge } from '../components';
import { cognitoClient } from '../utils/aws.server';
import { getCognitoConfig } from '../utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  // Check session
  const session = await getSession(request.headers.get('Cookie'));
  const email = session.get('forgotPasswordEmail');
  
  // Redirect to dashboard if already logged in
  const user = session.get('user');
  if (user) return redirect('/dashboard');
  
  return { email };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const _action = form.get('_action') as string;
  
  // Start password reset
  if (_action === 'initiate') {
    const email = form.get('email') as string;
    
    if (!email) {
      return { error: 'メールアドレスを入力してください。' };
    }
    
    try {
      // Get OAuth2 configuration
      const config = getCognitoConfig();
      
      // Start password reset
      await cognitoClient.forgotPassword({
        username: email,
        clientId: config.clientId,
        clientSecret: config.clientSecret
      });
      
      // Save email address to session
      const session = await getSession(request.headers.get('Cookie'));
      session.set('forgotPasswordEmail', email);
      
      // Commit session
      const sessionCookie = await commitSession(session, {
        expires: new Date(Date.now() + 3600 * 1000) // Valid for 1 hour
      });
      
      // Redirect to confirmation code input screen
      return redirect('/forgot-password', {
        headers: {
          'Set-Cookie': sessionCookie
        }
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      
      // Handle errors based on error type
      if (error.name === 'UserNotFoundException') {
        return { error: 'ユーザーが存在しません。' };
      } else if (error.name === 'LimitExceededException') {
        return { error: 'リクエストの制限を超えました。しばらく時間をおいてから再試行してください。' };
      } else {
        return { error: 'パスワードリセットの開始に失敗しました。もう一度お試しください。' };
      }
    }
  }
  
  // Confirm password reset
  if (_action === 'confirm') {
    const confirmationCode = form.get('confirmationCode') as string;
    const newPassword = form.get('newPassword') as string;
    const confirmPassword = form.get('confirmPassword') as string;
    
    // Get email address from session
    const session = await getSession(request.headers.get('Cookie'));
    const email = session.get('forgotPasswordEmail');
    
    if (!email) {
      return { error: 'セッションが無効です。もう一度最初からお試しください。' };
    }
    
    // Validate input values
    if (!confirmationCode) {
      return { error: '確認コードを入力してください。' };
    }
    
    if (!newPassword || !confirmPassword) {
      return { error: '新しいパスワードを入力してください。' };
    }
    
    if (newPassword !== confirmPassword) {
      return { error: 'パスワードが一致しません。' };
    }
    
    try {
      // Get OAuth2 configuration
      const config = getCognitoConfig();
      
      // Confirm password reset
      await cognitoClient.confirmForgotPassword({
        username: email,
        confirmationCode,
        newPassword,
        clientId: config.clientId,
        clientSecret: config.clientSecret
      });
      
      // Remove email address from session
      session.unset('forgotPasswordEmail');
      
      // Commit session
      const sessionCookie = await commitSession(session);
      
      // Redirect to login screen
      return redirect('/login', {
        headers: {
          'Set-Cookie': sessionCookie
        }
      });
    } catch (error: any) {
      console.error('Password reset confirmation error:', error);
      
      // Handle errors based on error type
      if (error.name === 'CodeMismatchException') {
        return { error: '確認コードが正しくありません。' };
      } else if (error.name === 'ExpiredCodeException') {
        return { error: '確認コードの有効期限が切れています。もう一度パスワードリセットを開始してください。' };
      } else if (error.name === 'InvalidPasswordException') {
        return { error: 'パスワードが要件を満たしていません。' };
      } else {
        return { error: 'パスワードリセットに失敗しました。もう一度お試しください。' };
      }
    }
  }
  
  return { error: '不正なリクエストです。' };
}

export default function ForgotPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';
  
  // Show confirmation code input screen if email address is saved
  const showConfirmationForm = loaderData && loaderData.email;

  return (
    <div className="login-container">
      <h1>パスワードのリセット</h1>
      
      {!showConfirmationForm ? (
        <>
          <p>パスワードをリセットするメールアドレスを入力してください</p>
          
          <Form method="post">
            {actionData && 'error' in actionData && (
              <div className="error-message">{actionData.error}</div>
            )}
            
            <div className="flex flex-col items-start gap-2 form-group">
              <Label htmlFor=":r1:">
                メールアドレス
                <RequirementBadge>
                  ※必須
                </RequirementBadge>
              </Label>
              <Input
                aria-describedby=":r2:"
                blockSize="lg"
                placeholder="メールアドレス"
                id=":r2:"
                name="email"
                required
                autoComplete="email"
                className="form-control w-full"
              />
            </div>
            
            <input type="hidden" name="_action" value="initiate" />
            
            <Button 
              type="submit" 
              disabled={isSubmitting}
              size="lg"
              variant="solid-fill"
            >
              {isSubmitting ? '処理中...' : '確認コードを送信'}
            </Button>
          </Form>
        </>
      ) : (
        <>
          <p>確認コードと新しいパスワードを入力してください</p>
          <p className="text-sm text-gray-600 mb-4">確認コードは {loaderData.email} に送信されました</p>
          
          <Form method="post">
            {actionData && 'error' in actionData && (
              <div className="error-message">{actionData.error}</div>
            )}
            
            <div className="flex flex-col items-start gap-2 form-group">
              <Label htmlFor=":r3:">
                確認コード
                <RequirementBadge>
                  ※必須
                </RequirementBadge>
              </Label>
              <Input
                aria-describedby=":r4:"
                blockSize="lg"
                placeholder="確認コード"
                id=":r4:"
                name="confirmationCode"
                required
                className="form-control w-full"
              />
            
              <Label htmlFor=":r5:">
                新しいパスワード
                <RequirementBadge>
                  ※必須
                </RequirementBadge>
              </Label>
              <Input
                aria-describedby=":r6:"
                blockSize="lg"
                placeholder="新しいパスワード"
                id=":r6:"
                name="newPassword"
                type="password"
                required
                autoComplete="new-password"
                className="form-control w-full"
              />
            
              <Label htmlFor=":r7:">
                パスワードの確認
                <RequirementBadge>
                  ※必須
                </RequirementBadge>
              </Label>
              <Input
                aria-describedby=":r8:"
                blockSize="lg"
                placeholder="パスワードの確認"
                id=":r8:"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                className="form-control w-full"
              />
            </div>
            
            <input type="hidden" name="_action" value="confirm" />
            
            <Button 
              type="submit" 
              disabled={isSubmitting}
              size="lg"
              variant="solid-fill"
            >
              {isSubmitting ? '処理中...' : 'パスワードをリセット'}
            </Button>
          </Form>
        </>
      )}
    </div>
  );
}
