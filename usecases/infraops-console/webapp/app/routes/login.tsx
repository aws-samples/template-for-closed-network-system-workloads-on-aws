import { Form, useActionData, useNavigation } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { authenticator } from '~/utils/auth.server';
import { getSession } from '~/utils/session.server';
import { Button, Input, Label, RequirementBadge, UniversalLink } from '~/components';

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  const idToken = session.get('idToken');
  if (idToken) return redirect('/dashboard');

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    console.log('login action');
    // Use form authentication
    await authenticator.authenticate('form', request);
    
  } catch (error: any) {
    
    // Return error response
    if (error instanceof Response) {
      return error;
    }

    console.log('error', error);
    
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
  console.log('login');
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = (navigation.state === 'submitting' || navigation.state === 'loading') && 
                      navigation.formMethod === 'POST';
  console.log('Login actionData:', actionData);
  console.log('Navigation state:', navigation.state, 'isSubmitting:', isSubmitting);

  return (
    <div className="login-container">
      <h1>管理ツール</h1>
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
