/**
 * Legacy OAuth handlers - kept for backward compatibility
 * These will be deprecated in favor of the JWT-based OAuth 2.1 handlers
 */

import { createGitHubOAuthClient, getUserProfile, GitHubUserProfile } from './github';
import { createAuthSession, completeAuthSession, getAuthSession, upsertUser } from './db';
import * as arctic from 'arctic';
import type { Env } from './types';

// Legacy: Handle start of GitHub OAuth flow
export async function handleAuthStart(request: Request, env: Env): Promise<Response> {
  // Redirect to the new OAuth 2.1 authorize endpoint
  const url = new URL(request.url);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.REDIRECT_URI,
    // Generate a simple code challenge for PKCE
    code_challenge: crypto.randomUUID(),
    code_challenge_method: 'S256',
    state: arctic.generateState()
  });
  
  return Response.redirect(`${url.origin}/authorize?${params}`, 302);
}

// Legacy: Handle GitHub OAuth callback  
export async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return new Response(JSON.stringify({ error: 'Missing code or state' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Process callback through the original flow for compatibility
  try {
    const github = createGitHubOAuthClient(env);
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();
    
    const userProfile: GitHubUserProfile = await getUserProfile(accessToken);
    
    if (!userProfile.id) {
      return new Response(JSON.stringify({ error: 'Failed to get user profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await upsertUser(env.DB, {
      github_user_id: userProfile.id.toString(),
      username: userProfile.login
    });
    
    // Update session if exists
    const sessionResult = await env.DB.prepare(
      `SELECT session_id FROM auth_sessions WHERE state = ?`
    ).bind(state).first() as { session_id: string } | null;
    
    if (sessionResult && sessionResult.session_id) {
      await completeAuthSession(env.DB, sessionResult.session_id, userProfile.id.toString());
    }
    
    // Return success HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { font-family: system-ui; padding: 40px; text-align: center; }
          .message { margin: 20px 0; font-size: 18px; }
        </style>
      </head>
      <body>
        <h1>Authentication Successful!</h1>
        <p class="message">You can close this window and return to your application.</p>
        <p>Username: ${userProfile.login}</p>
      </body>
      </html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return new Response(JSON.stringify({ 
      error: 'Authentication failed', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Legacy: Get status of authentication session
export async function handleAuthStatus(request: Request, env: Env, sessionId: string): Promise<Response> {
  try {
    const session = await getAuthSession(env.DB, sessionId);
    
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      status: session.status,
      userId: session.github_user_id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to get session status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
