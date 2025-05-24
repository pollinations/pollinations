/**
 * PKCE (Proof Key for Code Exchange) implementation for OAuth 2.1
 * 
 * Required for MCP OAuth 2.1 compliance
 */

import { createAuthSession } from '../db';
import type { D1Database } from '@cloudflare/workers-types';

interface PKCEChallenge {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: 'S256';
}

interface AuthorizationRequest {
  state: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  redirect_uri: string;
  client_id?: string;
}

/**
 * Generate a cryptographically random code verifier
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate code challenge from verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

/**
 * Generate complete PKCE challenge
 */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const code_verifier = generateCodeVerifier();
  const code_challenge = await generateCodeChallenge(code_verifier);
  
  return {
    code_verifier,
    code_challenge,
    code_challenge_method: 'S256'
  };
}

/**
 * Store PKCE parameters with session
 */
export async function storePKCESession(
  db: D1Database,
  state: string,
  codeVerifier: string,
  codeChallenge: string,
  redirectUri?: string,
  clientId?: string
): Promise<string> {
  const sessionId = crypto.randomUUID();
  
  // Store PKCE parameters in the auth_sessions table
  // We'll extend the existing session structure to include PKCE data
  await db.prepare(`
    INSERT INTO auth_sessions (
      session_id, 
      state, 
      status, 
      created_at,
      code_verifier,
      code_challenge,
      redirect_uri,
      client_id
    ) VALUES (?, ?, 'pending', datetime('now'), ?, ?, ?, ?)
  `).bind(
    sessionId,
    state,
    codeVerifier,
    codeChallenge,
    redirectUri || '',
    clientId || ''
  ).run();
  
  return sessionId;
}

/**
 * Verify PKCE code verifier
 */
export async function verifyPKCE(
  db: D1Database,
  state: string,
  codeVerifier: string
): Promise<boolean> {
  // Get stored challenge from session
  const session = await db.prepare(`
    SELECT code_challenge, code_challenge_method 
    FROM auth_sessions 
    WHERE state = ? AND status = 'pending'
  `).bind(state).first();
  
  if (!session || !session.code_challenge) {
    return false;
  }
  
  // Verify the code verifier matches the challenge
  const calculatedChallenge = await generateCodeChallenge(codeVerifier);
  return calculatedChallenge === session.code_challenge;
}

/**
 * Base64 URL encoding without padding
 */
function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create authorization URL with PKCE parameters
 */
export function createAuthorizationURL(
  baseUrl: string,
  params: AuthorizationRequest
): string {
  const url = new URL(baseUrl);
  
  // Add OAuth 2.1 + PKCE parameters
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.code_challenge);
  url.searchParams.set('code_challenge_method', params.code_challenge_method);
  url.searchParams.set('redirect_uri', params.redirect_uri);
  
  if (params.client_id) {
    url.searchParams.set('client_id', params.client_id);
  }
  
  // Add required scopes
  url.searchParams.set('scope', 'openid profile email');
  
  return url.toString();
}
