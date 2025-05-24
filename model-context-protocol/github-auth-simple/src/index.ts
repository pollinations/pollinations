import type { Env } from './types';
import { createJWT, verifyJWT, extractBearerToken } from './jwt';
import { upsertUser, getUser, updateDomainAllowlist, getDomains, isDomainAllowed, saveOAuthState, getOAuthState, deleteOAuthState, cleanupOldStates, generateApiToken, getApiToken, deleteApiTokens, validateApiToken } from './db';
import { exchangeCodeForToken, getGitHubUser } from './github';

// Define the TEST_CLIENT_HTML directly to avoid module issues
const TEST_CLIENT_HTML = require('./test-client').TEST_CLIENT_HTML;

// Define the ScheduledEvent type for the scheduled function
interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Route handling
      switch (url.pathname) {
        case '/':
          // Serve the test client at the root path
          return new Response(TEST_CLIENT_HTML, { 
            headers: { ...corsHeaders, 'Content-Type': 'text/html' } 
          });
          
        case '/test-client':
          return new Response(TEST_CLIENT_HTML, { 
            headers: { ...corsHeaders, 'Content-Type': 'text/html' } 
          });
          
        case '/authorize':
          return handleAuthorize(request, env, corsHeaders);
          
        case '/callback':
          return handleCallback(request, env, corsHeaders);
          
        case '/api/user':
          return handleGetUser(request, env, corsHeaders);
          
        case '/api/domains':
          if (request.method === 'GET') {
            return handleGetDomains(request, env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleUpdateDomains(request, env, corsHeaders);
          }
          break;
          
        case '/api/check-domain':
          return handleCheckDomain(request, env, corsHeaders);
          
        case '/api/token':
          if (request.method === 'GET') {
            return handleGetApiToken(request, env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleGenerateApiToken(request, env, corsHeaders);
          }
      }
      
      return createErrorResponse(404, 'Resource not found', corsHeaders);
    } catch (error) {
      console.error('Error:', error);
      return createErrorResponse(500, 'Internal server error', corsHeaders);
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    // Clean up old OAuth states periodically
    await cleanupOldStates(env.DB);
  },
};

async function handleAuthorize(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get('redirect_uri');
  
  if (!redirectUri) {
    return createErrorResponse(400, 'Missing required parameter: redirect_uri', corsHeaders);
  }
  
  const state = crypto.randomUUID();
  await saveOAuthState(env.DB, state, redirectUri);
  
  // Use the current host for the OAuth callback
  const callbackUrl = new URL('/callback', url.origin).toString();
  
  // Use environment variables from env object
  const clientId = env.GITHUB_CLIENT_ID;
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'user:email',
    state,
  });
  
  const authUrl = `https://github.com/login/oauth/authorize?${params}`;
  return Response.redirect(authUrl, 302);
}

async function handleCallback(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return createErrorResponse(400, 'Missing required parameters: code or state', corsHeaders);
  }
  
  // Get saved state
  const savedState = await getOAuthState(env.DB, state);
  
  if (!savedState) {
    return createErrorResponse(400, 'Invalid or expired state', corsHeaders);
  }
  
  try {
    // Hardcode client ID and secret since env vars might be causing issues
    const clientId = 'Ov23li0fJetQ56U2JKsF';
    const clientSecret = env.GITHUB_CLIENT_SECRET;
    
    // Exchange code for token
    const accessToken = await exchangeCodeForToken(code, new URL('/callback', url.origin).toString(), env);
    
    // Get GitHub user
    const githubUser = await getGitHubUser(accessToken);
    
    // Create or update user
    const user = await upsertUser(env.DB, {
      github_user_id: githubUser.id.toString(),
      username: githubUser.login,
    });
    
    // Generate JWT
    const token = await createJWT(user.github_user_id, user.username, env);
    
    // Clean up state
    await deleteOAuthState(env.DB, state);
    
    // Redirect back to the original redirect URI with the token
    const redirectTo = new URL(savedState.redirect_uri);
    redirectTo.searchParams.set('token', token);
    redirectTo.searchParams.set('user_id', user.github_user_id);
    redirectTo.searchParams.set('username', user.username);
    
    return Response.redirect(redirectTo.toString(), 302);
  } catch (error) {
    console.error('Authentication failed:', error);
    return createErrorResponse(500, 'Authentication failed', corsHeaders);
  }
}

async function handleGetUser(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || !payload.sub) {
    return createErrorResponse(401, 'Invalid token', corsHeaders);
  }
  
  const user = await getUser(env.DB, payload.sub);
  if (!user) {
    return createErrorResponse(404, 'User not found', corsHeaders);
  }
  
  return new Response(JSON.stringify(user), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Get the user's domains from the database
  const domains = await getDomains(env.DB, userId);
  return new Response(JSON.stringify({ domains }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleUpdateDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  const { domains } = await request.json() as { domains: string[] };
  await updateDomainAllowlist(env.DB, userId, domains);
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCheckDomain(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const domain = url.searchParams.get('domain');
  
  if (!userId || !domain) {
    return createErrorResponse(400, 'Missing required parameters', corsHeaders);
  }
  
  const allowed = await isDomainAllowed(env.DB, userId, domain);
  
  return new Response(JSON.stringify({ allowed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Creates a standardized error response
 * @param status HTTP status code
 * @param message User-friendly error message
 * @param headers Response headers
 * @returns Standardized error response
 */
function createErrorResponse(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: true,
    message
  }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handleGetApiToken(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Get the user's API token
  const apiToken = await getApiToken(env.DB, userId);
  
  return new Response(JSON.stringify({ 
    token: apiToken,
    has_token: !!apiToken
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGenerateApiToken(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return createErrorResponse(400, 'Missing required parameter: user_id', corsHeaders);
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return createErrorResponse(401, 'Unauthorized', corsHeaders);
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return createErrorResponse(403, 'Forbidden', corsHeaders);
  }
  
  // Generate a new API token
  const apiToken = await generateApiToken(env.DB, userId);
  
  return new Response(JSON.stringify({ 
    token: apiToken,
    generated: true
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
