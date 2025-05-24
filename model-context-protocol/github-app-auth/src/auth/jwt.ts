/**
 * JWT-based authentication for MCP compliance
 * 
 * Implements OAuth 2.1 compatible JWT tokens for authorization
 */

import * as jose from 'jose';
import type { Env } from '../types';

interface JWTPayload extends jose.JWTPayload {
  sub: string; // GitHub user ID
  username: string;
  jti?: string; // JWT ID for token tracking
}

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Generate a cryptographically secure secret for JWT signing
 */
export async function generateJWTSecret(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Create an access token for a GitHub user
 */
export async function createAccessToken(
  env: Env,
  githubUserId: string,
  username: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET || await generateJWTSecret());
  
  const payload: JWTPayload = {
    sub: githubUserId,
    username,
    iss: env.REDIRECT_URI?.replace('/callback', '') || 'github-auth-mcp',
    aud: 'mcp-client',
    jti: crypto.randomUUID()
  };

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

/**
 * Create a refresh token with longer expiration
 */
export async function createRefreshToken(
  env: Env,
  githubUserId: string,
  expiresIn: number = 2592000 // 30 days default
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET || await generateJWTSecret());
  
  const payload = {
    sub: githubUserId,
    type: 'refresh',
    jti: crypto.randomUUID()
  };

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(token: string, env: Env): Promise<JWTPayload | null> {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: 'mcp-github-auth',
      audience: 'mcp-client'
    });
    
    // Validate required fields
    if (!payload.sub || !payload.username) {
      throw new Error('Invalid token payload');
    }
    
    return payload as JWTPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Create OAuth 2.1 compliant token response
 */
export function createTokenResponse(
  accessToken: string,
  refreshToken?: string,
  expiresIn: number = 3600
): TokenResponse {
  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn
  };

  if (refreshToken) {
    response.refresh_token = refreshToken;
  }

  return response;
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Middleware to verify JWT tokens in requests
 */
export async function requireAuth(
  request: Request,
  env: Env
): Promise<{ user: JWTPayload } | Response> {
  const token = extractBearerToken(request);
  
  if (!token) {
    return new Response(JSON.stringify({ 
      error: 'unauthorized',
      error_description: 'No access token provided'
    }), {
      status: 401,
      headers: { 
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="mcp"'
      }
    });
  }

  const payload = await verifyAccessToken(token, env);
  
  if (!payload) {
    return new Response(JSON.stringify({ 
      error: 'invalid_token',
      error_description: 'The access token is invalid or expired'
    }), {
      status: 401,
      headers: { 
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token"'
      }
    });
  }

  return { user: payload };
}
