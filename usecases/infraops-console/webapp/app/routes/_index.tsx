import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // ユーザーが認証されているかチェック
  console.log('index page loader');
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  
  // 認証されていればダッシュボードへ、そうでなければログインページへリダイレクト
  if (user) {
    return redirect("/dashboard");
  }
  
  return redirect("/login");
}

// このコンポーネントは実際には表示されない（リダイレクトされるため）
export default function Index() {
  return null;
}
