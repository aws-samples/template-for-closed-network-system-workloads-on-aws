import { CognitoJwtVerifier } from "aws-jwt-verify";
import { requireAuthentication } from './auth.server';

// Cognito JWT Verifierの初期化（シングルトンパターン）
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.CLIENT_ID!,
});

// IDトークンを検証してペイロードを取得
export async function verifyAndDecodeIdToken(idToken: string) {
  try {
    const payload = await verifier.verify(idToken);
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

// 検証済みトークンからGroupIdを安全に取得
export async function getVerifiedGroupId(request: Request): Promise<string> {
  const idToken = (await requireAuthentication(request)).idToken;
  const payload = await verifyAndDecodeIdToken(idToken);
  
  // カスタム属性からgroupIdを取得
  const groupId = payload['custom:groupId'] as string;
  
  if (!groupId) {
    throw new Error('GroupId not found in verified token');
  }
  
  return groupId;
}

// 管理者権限も検証済みトークンから取得
export async function getVerifiedUserInfo(request: Request) {
  const idToken = (await requireAuthentication(request)).idToken;
  const payload = await verifyAndDecodeIdToken(idToken);
  
  return {
    email: payload.email as string,
    groupId: payload['custom:groupId'] as string,
    isAdmin: payload['custom:isAdmin'] === 'true',
    groups: payload['cognito:groups'] as string[] || [],
    // 必要に応じて他の属性も追加
  };
}
