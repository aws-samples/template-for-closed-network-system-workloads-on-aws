import { CognitoJwtVerifier } from "aws-jwt-verify";
import { requireAuthentication } from './auth.server';

// Initialize Cognito JWT Verifier (Singleton pattern)
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.CLIENT_ID!,
});

// Verify ID token and get payload
export async function verifyAndDecodeIdToken(idToken: string) {
  try {
    const payload = await verifier.verify(idToken);
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

// Safely get GroupId from verified token
export async function getVerifiedGroupId(request: Request): Promise<string> {
  const idToken = (await requireAuthentication(request)).idToken;
  const payload = await verifyAndDecodeIdToken(idToken);
  
  // Get groupId from custom attributes
  const groupId = payload['custom:groupId'] as string;
  
  if (!groupId) {
    throw new Error('GroupId not found in verified token');
  }
  
  return groupId;
}

// Get admin privileges from verified token as well
export async function getVerifiedUserInfo(request: Request) {
  const idToken = (await requireAuthentication(request)).idToken;
  const payload = await verifyAndDecodeIdToken(idToken);
  
  return {
    email: payload.email as string,
    groupId: payload['custom:groupId'] as string,
    isAdmin: payload['custom:isAdmin'] === 'true',
    groups: payload['cognito:groups'] as string[] || [],
    // Add other attributes as needed
  };
}
