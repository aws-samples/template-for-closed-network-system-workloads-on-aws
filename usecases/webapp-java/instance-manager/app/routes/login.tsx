import { useEffect } from 'react';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { authenticator } from '~/utils/auth.server';
import { getSession, commitSession } from '~/utils/session.server';
import { Button, Input, Label, RequirementBadge, UniversalLink } from '~/components';

export async function loader({ request }: LoaderFunctionArgs) {
  // 既にログインしている場合はダッシュボードにリダイレクト
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  if (user) return redirect('/dashboard');

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    // フォーム認証を使用
    const user = await authenticator.authenticate('form', request);
    
    // ユーザーがnullの場合はエラー
    if (!user) {
      throw new Error('認証に失敗しました');
    }
    
    // ユーザー情報とトークンをセッションに保存
    const session = await getSession(request.headers.get('Cookie'));
    
    // 基本的なユーザー情報を保存
    session.set('user', {
      email: user.email,
      isAdmin: user.isAdmin
    });
    
    // トークンが存在する場合は保存
    if ('accessToken' in user) {
      session.set('accessToken', user.accessToken);
    }
    
    if ('refreshToken' in user && user.refreshToken) {
      session.set('refreshToken', user.refreshToken);
    }
    
    // セッションをコミット
    const sessionCookie = await commitSession(session, {
      expires: new Date(Date.now() + 3600 * 1000) // 1時間有効
    });
    
    // ダッシュボードにリダイレクト
    return redirect('/dashboard', {
      headers: {
        'Set-Cookie': sessionCookie
      }
    });
  } catch (error: any) {
    
    // エラーメッセージを返す
    if (error instanceof Response) {
      return error;
    }

    console.log('error', error);
    
    // エラーメッセージをより詳細に
    let errorMessage = 'ログインに失敗しました。メールアドレスとパスワードを確認してください。';
    
    if (error.message) {
      errorMessage = error.message;
    }

    return {
      error: errorMessage,
    };
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  return (
    <div className="login-container">
      <h1>EC2インスタンス管理ツール</h1>
      <p>ログイン情報を入力してください</p>
      
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
        
          <Label htmlFor=":r3:">
            パスワード
            <RequirementBadge>
              ※必須
            </RequirementBadge>
          </Label>
          <Input
            aria-describedby=":r4:"
            blockSize="lg"
            placeholder="パスワード"
            id=":r4:"
            name="password"
            required
            type="password"
            autoComplete="password"
            className="form-control w-full"
          />
        </div>
        
        <Button 
          type="submit" 
          disabled={isSubmitting}
          size="lg"
          variant="solid-fill"
        >
          {isSubmitting ? 'ログイン中...' : 'ログイン'}
        </Button>
        
        <div className="mt-4 text-center">
          <UniversalLink to="/forgot-password">
            パスワードを忘れた場合
          </UniversalLink>
        </div>
      </Form>
    </div>
  );
}
