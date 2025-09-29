import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';
import { commitSession, getSession } from './session.server';
import { User } from '~/models/user.server';
import { redirect } from '@remix-run/node';
import { cognitoClient } from './aws.server';

// ユーザータイプの定義
export type AuthUser = {
  email: string;
} | null;

// Authenticatorの作成
export const authenticator = new Authenticator<AuthUser>();

// Cognitoの設定を取得する関数
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

// FormStrategyの初期化関数
async function initFormStrategy() {
  try {
    // OAuth2の設定を取得
    const config = getCognitoConfig();
    
    // FormStrategyの設定
    authenticator.use(
      new FormStrategy(async ({ form, request }) => {
        // フォームからユーザー名とパスワードを取得
        const email = form.get('email') as string;
        const password = form.get('password') as string;
        
        if (!email || !password) {
          throw new Error('メールアドレスとパスワードは必須です');
        }
        
        let authResult;
        try {
          // ADMIN_USER_PASSWORD_AUTH認証を実行
          authResult = await cognitoClient.initiateAuth({
            username: email,
            password,
            clientId: config.clientId,
            clientSecret: config.clientSecret
          });
        } catch (error: any) {
          console.error('Authentication error:', error);
          
          // エラーの種類に応じた処理
          if (error.name === 'UserNotConfirmedException') {
            // ユーザーが確認されていない場合
            throw redirect('/error');
          } else if (error.name === 'NotAuthorizedException') {
            // 認証エラーの場合
            throw new Error('メールアドレスまたはパスワードが正しくありません');
          } else if (error.name === 'UserNotFoundException') {
            // ユーザーが存在しない場合
            throw new Error('ユーザーが存在しません');
          } else {
            // その他のエラー
            throw new Error('認証に失敗しました');
          }
        }
          
        if (authResult.ChallengeName === "NEW_PASSWORD_REQUIRED" && authResult.ChallengeParameters) {
          // セッションにチャレンジ情報を保存
          const session = await getSession(request.headers.get('Cookie'));
          session.set('challengeName', authResult.ChallengeName);
          session.set('challengeSession', authResult.Session);
          session.set('challengeEmail', JSON.parse(authResult.ChallengeParameters.userAttributes).email);

          throw redirect('/change-password', {
            headers: {
              'Set-Cookie': await commitSession(session, {
                expires: new Date(Date.now() + 300000) // 5分間有効
              })
            }
          });
        } 
        // セッションにIDトークンとユーザー情報の両方を保存
        const session = await getSession(request.headers.get('Cookie'));
    
        // IDトークンを保存
        console.log(`Storing ID Token in session: ${authResult.AuthenticationResult?.IdToken}`)
        session.set('idToken', authResult.AuthenticationResult?.IdToken);

        // ユーザー情報も保存
        session.set('user', {
          email: email,
          // 必要に応じて他の属性も追加
        });
    
        // セッションをコミットしてダッシュボードにリダイレクト
        throw redirect('/dashboard', {
          headers: {
            'Set-Cookie': await commitSession(session, {
              expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1日有効
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

// 初期化関数を実行
initFormStrategy().catch(error => {
  console.error('Failed to initialize Form strategy:', error);
});

// 管理者権限チェック
export async function requireAdmin(request: Request) {
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  
  // ユーザー情報がない場合はエラー
  if (!user) {
    throw redirect('/login');
  }
  
  // Cognitoのカスタム属性isAdminがTrueかどうかをチェック
  const isAdmin = user.isAdmin === true;
  
  if (!isAdmin) {
    throw new Response('Forbidden', { status: 403 });
  }
  
  return user;
}

// ログイン状態チェック
export async function requireUser(request: Request):Promise<User> {
  const session = await getSession(request.headers.get('Cookie'));
  const user:User = session.get('user');
  
  if (!user) {
    throw redirect('/login');
  }
  
  return user;
}

// IDトークンの検証は、一時認証情報取得時にAWS側で行うため、ここではトークンの存在チェックのみを行う
export async function requireAuthentication(request: Request): Promise<string> {
  console.log('requireAuthentication called');
  const session = await getSession(request.headers.get('Cookie'));
  const idToken = session.get('idToken');
  
  if (!idToken) {
    console.log('No ID token found in session, redirecting to login');
    throw redirect('/login');
  }
  
  return idToken;
}
