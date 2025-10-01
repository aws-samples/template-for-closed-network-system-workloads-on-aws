import { Form, useNavigation } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getSession } from '~/utils/session.server';
import { Button } from '~/components';

export async function loader({ request }: LoaderFunctionArgs) {
  // 既にログインしている場合はダッシュボードにリダイレクト
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  if (user) return redirect('/dashboard');

  // URLからエラーメッセージを取得
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  return {
    error: error || 'Authentication Error',
    errorDescription: errorDescription || 'An error occurred during authentication. Please try again.',
  };
}

export default function AuthError() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  return (
    <div className="auth-error-container">
      <h1>認証エラー</h1>
      <p>認証中にエラーが発生しました。もう一度お試しください。</p>
      
      <div className="back-to-login">
        <Form method="get" action="/login">
          <Button 
            type="submit" 
            variant="outline"
            size="lg"
            disabled={isSubmitting}
          >
            ログインページに戻る
          </Button>
        </Form>
      </div>
    </div>
  );
}
