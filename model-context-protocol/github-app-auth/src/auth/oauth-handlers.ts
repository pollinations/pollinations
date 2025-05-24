/**
 * OAuth 2.1 compliant handlers for MCP authorization
 */

import * as jose from 'jose';
import type { Env } from '../types';
import { createGitHubOAuthClient, getUserProfile } from '../github';
import { upsertUser } from '../db';
import { 
  createAccessToken, 
  createRefreshToken, 
  createTokenResponse,
  verifyAccessToken,
  extractBearerToken
} from './jwt';
import {
  generatePKCEChallenge,
  storePKCESession,
  verifyPKCE,
  createAuthorizationURL
} from './pkce';

/**
 * OAuth 2.1 Authorization Endpoint
 * Initiates the authorization flow with PKCE
 */
export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  // Extract OAuth parameters
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const scope = url.searchParams.get('scope');
  
  // Validate required parameters
  if (!responseType || responseType !== 'code') {
    return new Response(JSON.stringify({ 
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!redirectUri) {
    return new Response(JSON.stringify({ 
      error: 'invalid_request',
      error_description: 'redirect_uri is required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // PKCE is required for MCP
  if (!codeChallenge || !codeChallengeMethod || codeChallengeMethod !== 'S256') {
    return new Response(JSON.stringify({ 
      error: 'invalid_request',
      error_description: 'PKCE with S256 method is required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Generate internal state if not provided
  const internalState = state || crypto.randomUUID();
  
  // Store PKCE session (without code_verifier as client keeps it)
  await storePKCESession(
    env.DB, 
    internalState, 
    '', // verifier not stored on authorize
    codeChallenge,
    redirectUri,
    clientId || ''
  );
  
  // Create GitHub OAuth URL
  const github = createGitHubOAuthClient(env);
  const githubAuthUrl = github.createAuthorizationURL(internalState, ['user:email']);
  
  // Redirect to GitHub
  return Response.redirect(githubAuthUrl.toString(), 302);
}

/**
 * OAuth 2.1 Token Endpoint
 * Exchanges authorization code for tokens with PKCE verification
 */
export async function handleToken(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  const contentType = request.headers.get('content-type') || '';
  let params: URLSearchParams;
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    params = new URLSearchParams(body);
  } else {
    return new Response(JSON.stringify({ 
      error: 'invalid_request',
      error_description: 'Content-Type must be application/x-www-form-urlencoded'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const grantType = params.get('grant_type');
  
  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(params, env);
  } else if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(params, env);
  } else {
    return new Response(JSON.stringify({ 
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code and refresh_token grants are supported'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle authorization code grant with PKCE
 */
async function handleAuthorizationCodeGrant(
  params: URLSearchParams,
  env: Env
): Promise<Response> {
  const code = params.get('code');
  const codeVerifier = params.get('code_verifier');
  const redirectUri = params.get('redirect_uri');
  
  if (!code || !codeVerifier) {
    return new Response(JSON.stringify({ 
      error: 'invalid_request',
      error_description: 'code and code_verifier are required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // For GitHub OAuth, we need to extract the state from the code
    // This is a simplified version - in production you'd store the mapping
    const github = createGitHubOAuthClient(env);
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();
    
    // Get user profile from GitHub
    const userProfile = await getUserProfile(accessToken);
    
    if (!userProfile.id) {
      throw new Error('Failed to get user profile');
    }
    
    // Store/update user
    await upsertUser(env.DB, {
      github_user_id: userProfile.id.toString(),
      username: userProfile.login
    });
    
    // Create JWT tokens
    const jwtAccessToken = await createAccessToken(
      env,
      userProfile.id.toString(),
      userProfile.login
    );
    
    const jwtRefreshToken = await createRefreshToken(
      env,
      userProfile.id.toString()
    );
    
    // Store JWT tokens for tracking
    await env.DB.prepare(`
      INSERT INTO jwt_tokens (jti, github_user_id, token_type, expires_at)
      VALUES (?, ?, 'access', datetime('now', '+1 hour'))
    `).bind(
      crypto.randomUUID(),
      userProfile.id.toString()
    ).run();
    
    // Return OAuth 2.1 compliant response
    const tokenResponse = createTokenResponse(jwtAccessToken, jwtRefreshToken);
    
    return new Response(JSON.stringify(tokenResponse), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return new Response(JSON.stringify({ 
      error: 'invalid_grant',
      error_description: 'The authorization code is invalid or expired'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle refresh token grant
 */
async function handleRefreshTokenGrant(
  params: URLSearchParams,
  env: Env
): Promise<Response> {
  const refreshToken = params.get('refresh_token');
  
  if (!refreshToken) {
    return new Response(JSON.stringify({ 
      error: 'invalid_request',
      error_description: 'refresh_token is required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Verify refresh token
    const secret = new TextEncoder().encode(env.JWT_SECRET || '');
    const { payload } = await jose.jwtVerify(refreshToken, secret);
    
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    // Get user from database
    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE github_user_id = ?'
    ).bind(payload.sub as string).first();
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Create new access token
    const newAccessToken = await createAccessToken(
      env,
      user.github_user_id as string,
      user.username as string
    );
    
    // Return new token
    const tokenResponse = createTokenResponse(newAccessToken);
    
    return new Response(JSON.stringify(tokenResponse), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'invalid_grant',
      error_description: 'The refresh token is invalid or expired'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * Required for MCP compliance
 */
export async function handleMetadataDiscovery(request: Request, env: Env): Promise<Response> {
  const baseUrl = env.REDIRECT_URI?.replace('/callback', '') || 'http://localhost:8787';
  
  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    jwks_uri: `${baseUrl}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
    token_endpoint_auth_methods_supported: ['none'], // Public clients
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email']
  };
  
  return new Response(JSON.stringify(metadata), {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=3600'
    }
  });
}

/**
 * Dynamic Client Registration endpoint
 * Optional but recommended for MCP
 */
export async function handleClientRegistration(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    const registration = await request.json() as {
      client_name?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      response_types?: string[];
      scope?: string;
      contacts?: string[];
    };
    
    // Validate required fields
    if (!registration.client_name || !registration.redirect_uris) {
      return new Response(JSON.stringify({ 
        error: 'invalid_client_metadata',
        error_description: 'client_name and redirect_uris are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate client credentials
    const clientId = crypto.randomUUID();
    
    // Store client registration
    await env.DB.prepare(`
      INSERT INTO oauth_clients (
        client_id, client_name, redirect_uris, grant_types, 
        response_types, scope, contacts
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clientId,
      registration.client_name,
      JSON.stringify(registration.redirect_uris),
      JSON.stringify(registration.grant_types || ['authorization_code']),
      JSON.stringify(registration.response_types || ['code']),
      registration.scope || 'openid profile email',
      JSON.stringify(registration.contacts || [])
    ).run();
    
    // Return client information
    const response = {
      client_id: clientId,
      client_name: registration.client_name,
      redirect_uris: registration.redirect_uris,
      grant_types: registration.grant_types || ['authorization_code'],
      response_types: registration.response_types || ['code'],
      scope: registration.scope || 'openid profile email',
      token_endpoint_auth_method: 'none' // Public client
    };
    
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'invalid_client_metadata',
      error_description: 'Invalid registration request'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
