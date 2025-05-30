import type { Env, UserTier } from './types';
import { createJWT, verifyJWT, extractBearerToken } from './jwt';
import { upsertUser, getUser, updateDomainAllowlist, getDomains, isDomainAllowed, saveOAuthState, getOAuthState, deleteOAuthState, cleanupOldStates, generateApiToken, getApiToken, deleteApiTokens, validateApiToken, getUserTier, setUserTier, getAllUserTiers, findUserByDomain, getUserPreferences, setUserPreference, updateUserPreferences, deleteUserPreference } from './db';
import { extractReferrer } from '../../shared/extractFromRequest.js';
import { exchangeCodeForToken, getGitHubUser } from './github';
import { handleAdminDatabaseDump } from './admin';
import { generateHTML } from './client/html';

// Add proper type declarations for DOM types
declare global {
  interface Window {}
}

// Make sure TypeScript knows about these DOM types
declare var Response: any;
declare var Request: any;
declare var URL: any;
declare var console: any;

// Define type aliases for better type checking
type ResponseType = any;
type RequestType = any;

// Define the TEST_CLIENT_HTML directly to avoid module issues
const TEST_CLIENT_HTML = generateHTML();

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
          break;
          
        case '/api/user-tier':
          if (request.method === 'GET') {
            return handleGetUserTier(request, env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleSetUserTier(request, env, corsHeaders);
          }
          break;
          
        case '/api/user-tiers':
          if (request.method === 'GET') {
            return handleGetAllUserTiers(request, env, corsHeaders);
          }
          break;
          
        case '/admin/database-dump':
          if (request.method === 'GET') {
            return handleAdminDatabaseDump(request, env, corsHeaders);
          }
          break;
          
        case '/api/validate-referrer':
          if (request.method === 'GET') {
            return handleValidateReferrer(request, env, corsHeaders);
          }
          break;
          
        case '/preferences':
          if (request.method === 'GET') {
            return handleGetPreferences(request, env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleUpdatePreferences(request, env, corsHeaders);
          }
          break;
          
        case '/admin/preferences':
          if (request.method === 'GET') {
            return handleAdminGetPreferences(request, env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleAdminUpdatePreferences(request, env, corsHeaders);
          }
          break;
      }
      
      // Check if the path matches the pattern /api/validate-token/:token
      if (url.pathname.startsWith('/api/validate-token/')) {
        if (request.method === 'GET') {
          // Extract token from the URL path
          const token = url.pathname.replace('/api/validate-token/', '');
          return handleValidateToken(token, env, corsHeaders);
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

/**
 * Validates an API token and returns the associated user ID if valid.
 * This endpoint is used by other Pollinations services to verify tokens.
 * @param token The API token to validate
 * @param env Environment variables
 * @param corsHeaders CORS headers to include in the response
 * @returns Response with validation result
 */
async function handleValidateToken(token: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    if (!token) {
      return createErrorResponse(400, 'Missing required parameter: token', corsHeaders);
    }
    
    // Validate the token against the database
    const userId = await validateApiToken(env.DB, token);
    
    // Get user tier if token is valid
    let tier: UserTier = 'seed';
    if (userId) {
      tier = await getUserTier(env.DB, userId);
    }
    
    // Return validation result with tier information
    return new Response(JSON.stringify({
      valid: userId !== null,
      userId: userId,
      tier: userId ? tier : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error validating token:', error);
    return createErrorResponse(400, 'Invalid request format', corsHeaders);
  }
}

/**
 * Get a user's tier
 * @param request Request object
 * @param env Environment variables
 * @param corsHeaders CORS headers
 * @returns Response with the user's tier
 */
async function handleGetUserTier(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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
  
  // Get the user's tier
  const tier = await getUserTier(env.DB, userId);
  
  return new Response(JSON.stringify({ 
    tier
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Set a user's tier (admin only)
 * @param request Request object
 * @param env Environment variables
 * @param corsHeaders CORS headers
 * @returns Response indicating success
 */
async function handleSetUserTier(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Verify admin auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.replace('Bearer ', '') !== env.ADMIN_API_KEY) {
    return createErrorResponse(403, 'Forbidden - Admin access required', corsHeaders);
  }
  
  // Parse request body
  let userId: string;
  let tier: UserTier;
  
  try {
    const body = await request.json() as { tier: string, user_id: string };
    
    // Check for user_id in body
    if (!body.user_id) {
      return createErrorResponse(400, 'Missing required parameter: user_id in request body', corsHeaders);
    }
    
    userId = body.user_id;
    
    if (!body.tier || !['seed', 'flower', 'nectar'].includes(body.tier)) {
      return createErrorResponse(400, 'Invalid tier value. Must be one of: seed, flower, nectar', corsHeaders);
    }
    
    tier = body.tier as UserTier;
  } catch (error) {
    return createErrorResponse(400, 'Invalid request body', corsHeaders);
  }
  
  // Set the user's tier
  await setUserTier(env.DB, userId, tier);
  
  return new Response(JSON.stringify({ 
    success: true, 
    userId, 
    tier 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Get all users with their tiers (admin only)
 * @param request Request object
 * @param env Environment variables
 * @param corsHeaders CORS headers
 * @returns Response with all users and their tiers
 */
async function handleGetAllUserTiers(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Verify admin auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.replace('Bearer ', '') !== env.ADMIN_API_KEY) {
    return createErrorResponse(403, 'Forbidden - Admin access required', corsHeaders);
  }
  
  // Get all users with their tiers
  const userTiers = await getAllUserTiers(env.DB);
  
  return new Response(JSON.stringify({ 
    users: userTiers,
    count: userTiers.length
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Validate if a referrer domain is registered by any user
 * @param request Request object
 * @param env Environment variables
 * @param corsHeaders CORS headers
 * @returns Response with validation result
 */
export async function handleValidateReferrer(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {

  // Fall back to standard referrer extraction if no domain parameter
  const referrerInput = extractReferrer(request);
  
 
  if (!referrerInput) {
    return createErrorResponse(400, 'Missing referrer information', corsHeaders);
  }
  
  try {
    // Extract domain from the referrer (in case it's a URL)
    let domain = referrerInput;
    
    // If referrer is a URL, extract just the domain part
    if (referrerInput.startsWith('http://') || referrerInput.startsWith('https://')) {
      try {
        const urlObj = new URL(referrerInput);
        domain = urlObj.hostname;
      } catch (error) {
        // If parsing fails, use the raw value
        console.log('Failed to parse referrer as URL, using raw value:', error);
      }
    }
    
    console.log(`Validating domain: ${domain} (from referrer: ${referrerInput})`);
    
    // Check if the domain is registered by any user
    const userInfo = await findUserByDomain(env.DB, domain);
    
    if (userInfo) {
      // Domain is registered - return success with user info
      return new Response(JSON.stringify({
        valid: true,
        user_id: userInfo.user_id,
        username: userInfo.username,
        tier: userInfo.tier
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Domain not registered by any user
      return new Response(JSON.stringify({
        valid: false,
        message: 'Domain not registered by any user'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error validating referrer:', error);
    return createErrorResponse(500, 'Failed to validate referrer', corsHeaders);
  }
}

// Get user preferences - regular user endpoint (only their own preferences)
// @param request Request object
// @param env Environment variables
// @param corsHeaders CORS headers
// @returns Response with user preferences
async function handleGetPreferences(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Try to get userId from various sources
    let userId: string | null = null;
    
    // 1. Check for API token authentication
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    
    if (token) {
      userId = await validateApiToken(env.DB, token);
    }
    
    // 2. Check for JWT authentication (if not already authenticated)
    if (!userId) {
      const bearerToken = extractBearerToken(request);
      if (bearerToken) {
        try {
          const payload = await verifyJWT(bearerToken, env.JWT_SECRET);
          userId = payload.user_id;
        } catch (error) {
          // Invalid JWT
        }
      }
    }
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch preferences
    const preferences = await getUserPreferences(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      preferences: preferences
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return createErrorResponse(500, 'Internal server error', corsHeaders);
  }
}

// Update user preferences - regular user endpoint (only their own preferences)
// @param request Request object
// @param env Environment variables
// @param corsHeaders CORS headers
// @returns Response with updated preferences
async function handleUpdatePreferences(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Authentication check - must be either API token or JWT
    let userId: string | null = null;
    
    // Check API token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    
    if (token) {
      userId = await validateApiToken(env.DB, token);
    }
    
    // Check JWT if no API token
    if (!userId) {
      const bearerToken = extractBearerToken(request);
      if (bearerToken) {
        try {
          const payload = await verifyJWT(bearerToken, env.JWT_SECRET);
          userId = payload.user_id;
        } catch (error) {
          // Invalid JWT
        }
      }
    }
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Parse request body
    const body = await request.json() as { preferences?: Record<string, any>, key?: string, value?: any };
    
    // Input validation for key length and value size
    const MAX_KEY_LENGTH = 100;
    const MAX_VALUE_SIZE_BYTES = 10000; // 10KB for any single value
    const MAX_TOTAL_SIZE_BYTES = 100000; // 100KB total preferences size
    
    if (body.key !== undefined) {
      // Validate key length
      if (body.key.length > MAX_KEY_LENGTH) {
        return new Response(JSON.stringify({ error: `Preference key exceeds maximum length of ${MAX_KEY_LENGTH} characters` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Validate value size
      const valueSize = JSON.stringify(body.value).length;
      if (valueSize > MAX_VALUE_SIZE_BYTES) {
        return new Response(JSON.stringify({ error: `Preference value exceeds maximum size of ${MAX_VALUE_SIZE_BYTES} bytes` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (body.preferences) {
      // Validate total preferences size
      const totalSize = JSON.stringify(body.preferences).length;
      if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        return new Response(JSON.stringify({ error: `Total preferences exceed maximum size of ${MAX_TOTAL_SIZE_BYTES} bytes` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Validate individual keys and values
      for (const key in body.preferences) {
        if (key.length > MAX_KEY_LENGTH) {
          return new Response(JSON.stringify({ error: `Preference key '${key}' exceeds maximum length of ${MAX_KEY_LENGTH} characters` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const valueSize = JSON.stringify(body.preferences[key]).length;
        if (valueSize > MAX_VALUE_SIZE_BYTES) {
          return new Response(JSON.stringify({ error: `Value for key '${key}' exceeds maximum size of ${MAX_VALUE_SIZE_BYTES} bytes` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    if (body.preferences) {
      // Update multiple preferences at once
      await updateUserPreferences(env.DB, userId, body.preferences);
    } else if (body.key !== undefined && body.value !== undefined) {
      // Update a single preference
      await setUserPreference(env.DB, userId, body.key, body.value);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Return updated preferences
    const updatedPreferences = await getUserPreferences(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      preferences: updatedPreferences
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error updating preferences:', error);
    return createErrorResponse(500, 'Internal server error', corsHeaders);
  }
}

// Admin endpoint to get any user's preferences
// @param request Request object
// @param env Environment variables
// @param corsHeaders CORS headers
// @returns Response with user preferences
async function handleAdminGetPreferences(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Verify admin auth
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.replace('Bearer ', '') !== env.ADMIN_API_KEY) {
      return createErrorResponse(403, 'Forbidden - Admin access required', corsHeaders);
    }
    
    // Get user ID from query parameter
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch preferences
    const preferences = await getUserPreferences(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      preferences: preferences
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return createErrorResponse(500, 'Internal server error', corsHeaders);
  }
}

// Admin endpoint to update any user's preferences
// @param request Request object
// @param env Environment variables
// @param corsHeaders CORS headers
// @returns Response with updated preferences
async function handleAdminUpdatePreferences(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Verify admin auth
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.replace('Bearer ', '') !== env.ADMIN_API_KEY) {
      return createErrorResponse(403, 'Forbidden - Admin access required', corsHeaders);
    }
    
    // Get user ID from query parameter
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Parse request body
    const body = await request.json() as { preferences?: Record<string, any>, key?: string, value?: any };
    
    // Input validation for key length and value size
    const MAX_KEY_LENGTH = 100;
    const MAX_VALUE_SIZE_BYTES = 10000; // 10KB for any single value
    const MAX_TOTAL_SIZE_BYTES = 100000; // 100KB total preferences size
    
    if (body.key !== undefined) {
      // Validate key length
      if (body.key.length > MAX_KEY_LENGTH) {
        return new Response(JSON.stringify({ error: `Preference key exceeds maximum length of ${MAX_KEY_LENGTH} characters` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Validate value size
      const valueSize = JSON.stringify(body.value).length;
      if (valueSize > MAX_VALUE_SIZE_BYTES) {
        return new Response(JSON.stringify({ error: `Preference value exceeds maximum size of ${MAX_VALUE_SIZE_BYTES} bytes` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (body.preferences) {
      // Validate total preferences size
      const totalSize = JSON.stringify(body.preferences).length;
      if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        return new Response(JSON.stringify({ error: `Total preferences exceed maximum size of ${MAX_TOTAL_SIZE_BYTES} bytes` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Validate individual keys and values
      for (const key in body.preferences) {
        if (key.length > MAX_KEY_LENGTH) {
          return new Response(JSON.stringify({ error: `Preference key '${key}' exceeds maximum length of ${MAX_KEY_LENGTH} characters` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const valueSize = JSON.stringify(body.preferences[key]).length;
        if (valueSize > MAX_VALUE_SIZE_BYTES) {
          return new Response(JSON.stringify({ error: `Value for key '${key}' exceeds maximum size of ${MAX_VALUE_SIZE_BYTES} bytes` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    if (body.preferences) {
      // Update multiple preferences at once
      await updateUserPreferences(env.DB, userId, body.preferences);
    } else if (body.key !== undefined && body.value !== undefined) {
      // Update a single preference
      await setUserPreference(env.DB, userId, body.key, body.value);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Return updated preferences
    const updatedPreferences = await getUserPreferences(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      preferences: updatedPreferences
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error updating preferences:', error);
    return createErrorResponse(500, 'Internal server error', corsHeaders);
  }
}
