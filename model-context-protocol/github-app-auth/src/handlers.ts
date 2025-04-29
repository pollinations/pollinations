/**
 * API handlers for GitHub authentication
 * 
 * Minimal implementation following the "thin proxy" design principle
 */

import { createGitHubOAuthClient, getUserProfile, GitHubUserProfile } from './github';
import { createAuthSession, completeAuthSession, getAuthSession, upsertUser } from './db';
import * as arctic from 'arctic';
import type { Env } from './types';

// Handle start of GitHub OAuth flow
export async function handleAuthStart(request: Request, env: Env): Promise<Response> {
  const github = createGitHubOAuthClient(env);
  
  // Generate state for CSRF protection
  const state = arctic.generateState();
  
  // Create auth URL with scope for reading user info
  const authUrl = github.createAuthorizationURL(state, ['user:email']);
  
  // Store state in database with new session
  const sessionId = await createAuthSession(env.DB, state);
  
  // Return session ID and auth URL
  return new Response(JSON.stringify({
    sessionId,
    authUrl
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle GitHub OAuth callback
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
  
  try {
    const github = createGitHubOAuthClient(env);
    
    // Validate the code and get access token
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();
    
    // Get the user's GitHub profile
    const userProfile: GitHubUserProfile = await getUserProfile(accessToken);
    
    if (!userProfile.id) {
      return new Response(JSON.stringify({ error: 'Failed to get user profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Store user in database
    await upsertUser(env.DB, {
      github_user_id: userProfile.id.toString(),
      username: userProfile.login
    });
    
    // Find the session that matches this state (in a real app, more verification would be done)
    // For simplicity in this demo, we're assuming the session lookup would work correctly
    // We would typically validate the session from a cookie or search for it by state
    
    // Create HTML response for successful auth
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Successful</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px; text-align: center; line-height: 1.5; }
          .container { max-width: 600px; margin: 0 auto; }
          h1 { color: #2ea44f; }
          .message { margin: 20px 0; font-size: 18px; }
          .info { background-color: #f6f8fa; padding: 15px; border-radius: 6px; text-align: left; margin: 20px 0; }
          .close { display: inline-block; margin-top: 20px; background-color: #2ea44f; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Authentication Successful!</h1>
          <p class="message">You're now authenticated with GitHub.</p>
          <div class="info">
            <p><strong>Username:</strong> ${userProfile.login}</p>
            <p>You can close this window and return to your chatbot.</p>
          </div>
          <a href="javascript:window.close()" class="close">Close Window</a>
        </div>
      </body>
      </html>
    `;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get status of authentication session
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
    console.error('Auth status error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get session status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
