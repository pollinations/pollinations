import type { Env } from './types';
import { createJWT, verifyJWT, extractBearerToken } from './jwt';
import { upsertUser, getUser, updateDomainAllowlist, isDomainAllowed, saveOAuthState, getOAuthState, deleteOAuthState, cleanupOldStates } from './db';
import { exchangeCodeForToken, getGitHubUser } from './github';
import { TEST_CLIENT_HTML } from './test-client';

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
          return new Response('GitHub Auth Simple', { headers: corsHeaders });
          
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
      }
      
      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Internal error', { status: 500, headers: corsHeaders });
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
    return new Response('redirect_uri required', { status: 400, headers: corsHeaders });
  }
  
  const state = crypto.randomUUID();
  await saveOAuthState(env.DB, state, redirectUri);
  
  // Use the current host for the OAuth callback
  const callbackUrl = new URL('/callback', url.origin).toString();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
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
    return new Response('Missing code or state', { status: 400, headers: corsHeaders });
  }
  
  // Get saved state
  const savedState = await getOAuthState(env.DB, state);
  if (!savedState) {
    return new Response('Invalid or expired state', { status: 400, headers: corsHeaders });
  }
  
  try {
    // Exchange code for token - use the same callback URL
    const callbackUrl = new URL('/callback', url.origin).toString();
    const accessToken = await exchangeCodeForToken(code, callbackUrl, env);
    const githubUser = await getGitHubUser(accessToken);
    
    // Create/update user
    const user = await upsertUser(env.DB, {
      github_user_id: githubUser.id.toString(),
      username: githubUser.login,
      avatar_url: githubUser.avatar_url,
      email: githubUser.email || undefined,
    });
    
    // Generate JWT
    const jwt = await createJWT(user.github_user_id, user.username, env);
    
    // Clean up state
    await deleteOAuthState(env.DB, state);
    
    // Redirect back with JWT
    const redirectUrl = new URL(savedState.redirect_uri);
    redirectUrl.searchParams.set('token', jwt);
    redirectUrl.searchParams.set('username', user.username);
    
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('OAuth error:', error);
    return new Response('Authentication failed', { status: 500, headers: corsHeaders });
  }
}

async function handleGetUser(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || !payload.sub) {
    return new Response('Invalid token', { status: 401, headers: corsHeaders });
  }
  
  const user = await getUser(env.DB, payload.sub);
  if (!user) {
    return new Response('User not found', { status: 404, headers: corsHeaders });
  }
  
  return new Response(JSON.stringify(user), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return new Response('user_id required', { status: 400, headers: corsHeaders });
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }
  
  const user = await getUser(env.DB, userId);
  return new Response(JSON.stringify({ domains: user?.domain_allowlist || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleUpdateDomains(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return new Response('user_id required', { status: 400, headers: corsHeaders });
  }
  
  // Verify auth
  const token = extractBearerToken(request);
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  
  const payload = await verifyJWT(token, env);
  if (!payload || payload.sub !== userId) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
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
    return new Response('user_id and domain required', { status: 400, headers: corsHeaders });
  }
  
  const allowed = await isDomainAllowed(env.DB, userId, domain);
  
  return new Response(JSON.stringify({ allowed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
