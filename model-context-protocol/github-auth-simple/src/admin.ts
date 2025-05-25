import type { Env } from './types';
import { createJWT, verifyJWT, extractBearerToken } from './jwt';
import {
  upsertUser, getUser, updateDomainAllowlist, getDomains, isDomainAllowed,
  saveOAuthState, getOAuthState, deleteOAuthState, generateApiToken, getApiToken,
  getAllUsers, getAllDomains, getAllApiTokens, getAllOAuthStates
} from './db';
import { exchangeCodeForToken, getGitHubUser } from './github';

// Creates a standardized error response
export function createErrorResponse(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: true,
    message
  }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

/**
 * Middleware to verify admin API key
 */
function verifyAdminApiKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return token === env.ADMIN_API_KEY;
}

/**
 * Handle admin database dump request
 * This endpoint returns all important database tables for admin purposes
 */
export async function handleAdminDatabaseDump(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Verify admin API key
  if (!verifyAdminApiKey(request, env)) {
    return createErrorResponse(403, 'Unauthorized: Invalid admin API key', corsHeaders);
  }
  
  try {
    // Get all data from important tables
    const users = await getAllUsers(env.DB);
    const domains = await getAllDomains(env.DB);
    const apiTokens = await getAllApiTokens(env.DB);
    const oauthStates = await getAllOAuthStates(env.DB);
    
    // Return all data as JSON
    return new Response(JSON.stringify({
      users,
      domains,
      apiTokens,
      oauthStates,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Admin database dump error:', error);
    return createErrorResponse(500, 'Failed to fetch database data', corsHeaders);
  }
}

export async function handleAuthorize(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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

export async function handleCallback(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return createErrorResponse(400, 'Missing code or state parameter', corsHeaders);
  }
  
  try {
    // Verify state and get redirect URI
    const stateData = await getOAuthState(env.DB, state);
    if (!stateData) {
      return createErrorResponse(400, 'Invalid or expired state parameter', corsHeaders);
    }
    
    // Exchange code for token
    const callbackUrl = new URL('/callback', new URL(request.url).origin).toString();
    const accessToken = await exchangeCodeForToken(code, callbackUrl, env);
    
    // Get user info from GitHub
    const githubUser = await getGitHubUser(accessToken);
    
    // Create or update user in our database
    const user = await upsertUser(env.DB, {
      github_user_id: githubUser.id.toString(),
      username: githubUser.login,
    });
    
    // Create JWT token
    const jwtToken = await createJWT(user.github_user_id, user.username, env);
    
    // Clean up OAuth state
    await deleteOAuthState(env.DB, state);
    
    // Redirect to the original redirect URI with the token and user info
    const redirectUrl = new URL(stateData.redirect_uri);
    redirectUrl.searchParams.set('token', jwtToken);
    redirectUrl.searchParams.set('user_id', user.github_user_id);
    redirectUrl.searchParams.set('username', user.username);
    
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return createErrorResponse(500, 'Authentication failed', corsHeaders);
  }
}

export async function handleGetUser(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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
  
  const user = await getUser(env.DB, userId);
  if (!user) {
    return createErrorResponse(404, 'User not found', corsHeaders);
  }
  
  return new Response(JSON.stringify(user), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleGetDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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

export async function handleUpdateDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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

export async function handleCheckDomain(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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

export async function handleGetApiToken(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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

export async function handleGenerateApiToken(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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
