import type { ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { sessionStorage } from '~/utils/session.server';

export async function action({ request }: ActionFunctionArgs) {
  // セッションを取得
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  
  try {
    // セッションを破棄
    const cookie = await sessionStorage.destroySession(session);
    
    // ログインページにリダイレクト
    return redirect('/login', {
      headers: {
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    console.error('Error during logout:', error);
    
    // エラーが発生した場合も同様にセッションを破棄してログインページにリダイレクト
    return redirect('/login', {
      headers: {
        'Set-Cookie': await sessionStorage.destroySession(session),
      },
    });
  }
}

export async function loader() {
  // GETリクエストの場合はログインページにリダイレクト
  return redirect('/login');
}

// このコンポーネントは実際には表示されない（リダイレクトされるため）
export default function Logout() {
  return null;
}
