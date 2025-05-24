import * as jose from 'jose';
import type { Env } from './types';

export async function createJWT(userId: string, username: string, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  
  const jwt = await new jose.SignJWT({
    sub: userId,
    username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
    
  return jwt;
}

export async function verifyJWT(token: string, env: Env): Promise<jose.JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
