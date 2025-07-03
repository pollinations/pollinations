import type { Env } from './types';
import type { Request, Response as WorkersResponse } from '@cloudflare/workers-types';
import { 
  getUserMetrics,
  setUserMetric,
  updateUserMetrics,
  incrementUserMetric
} from './db';

// Make sure TypeScript knows about these DOM types
declare var URL: any;
declare var console: any;

/**
 * Verify admin API key from request
 * Checks both header and URL parameter for the API key
 */
function verifyAdminApiKey(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const apiKeyParam = url.searchParams.get('api_key');
  const authHeader = request.headers.get('Authorization');
  const headerApiKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  return (apiKeyParam === env.ADMIN_API_KEY) || (headerApiKey === env.ADMIN_API_KEY);
}

/**
 * Handle admin database dump request
 * This endpoint returns all database tables for admin purposes
 * Uses a simple hardcoded API key from environment variables
 */
export async function handleAdminDatabaseDump(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<WorkersResponse> {
  if (!verifyAdminApiKey(request, env)) {
    return new Response(JSON.stringify({
      error: true,
      message: 'Unauthorized: Invalid admin API key'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const users = await env.DB.prepare('SELECT * FROM users').all();
    const domains = await env.DB.prepare('SELECT * FROM domains').all();
    const apiTokens = await env.DB.prepare('SELECT * FROM api_tokens').all();
    const oauthStates = await env.DB.prepare('SELECT * FROM oauth_state').all();
    const userTiers = await env.DB.prepare('SELECT * FROM user_tiers').all();
    
    return new Response(JSON.stringify({
      users: users.results,
      domains: domains.results,
      apiTokens: apiTokens.results,
      oauthStates: oauthStates.results,
      userTiers: userTiers.results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Admin database dump error:', error);
    return new Response(JSON.stringify({
      error: true,
      message: 'Failed to fetch database data'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle admin user info request
 * This endpoint returns all information for a specific user
 * Uses a simple hardcoded API key from environment variables
 */
export async function handleAdminUserInfo(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<WorkersResponse> {
  if (!verifyAdminApiKey(request, env)) {
    return new Response(JSON.stringify({
      error: true,
      message: 'Unauthorized: Invalid admin API key'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return new Response(JSON.stringify({
      error: true,
      message: 'Missing required parameter: user_id'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const userInfo = await env.DB.prepare('SELECT * FROM users WHERE github_user_id = ?').bind(userId).first();
    
    if (!userInfo) {
      return new Response(JSON.stringify({
        error: true,
        message: 'User not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const domains = await env.DB.prepare('SELECT * FROM domains WHERE user_id = ?').bind(userId).all();
    const apiTokens = await env.DB.prepare('SELECT * FROM api_tokens WHERE user_id = ?').bind(userId).all();
    const userTier = await env.DB.prepare('SELECT * FROM user_tiers WHERE user_id = ?').bind(userId).first();
    const preferences = await env.DB.prepare('SELECT preferences FROM users WHERE github_user_id = ?').bind(userId).first();
    
    return new Response(JSON.stringify({
      user: userInfo,
      domains: domains.results,
      apiTokens: apiTokens.results,
      userTier: userTier,
      preferences: preferences?.preferences ? JSON.parse(preferences.preferences as string) : {},
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Admin user info error:', error);
    return new Response(JSON.stringify({
      error: true,
      message: 'Failed to fetch user data'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Admin endpoint to get any user's metrics
export async function handleAdminGetMetrics(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<WorkersResponse> {
  try {
    if (!verifyAdminApiKey(request, env)) {
      return new Response(JSON.stringify({ 
        error: true, 
        message: 'Unauthorized: Invalid admin API key' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (!userId) {
      return new Response(JSON.stringify({ error: true, message: 'user_id parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const metrics = await getUserMetrics(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      metrics: metrics
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return new Response(JSON.stringify({ error: true, message: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Admin endpoint to update any user's metrics
export async function handleAdminUpdateMetrics(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<WorkersResponse> {
  try {
    if (!verifyAdminApiKey(request, env)) {
      return new Response(JSON.stringify({ 
        error: true, 
        message: 'Unauthorized: Invalid admin API key' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (!userId) {
      return new Response(JSON.stringify({ error: true, message: 'user_id parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json() as { metrics?: Record<string, any>, key?: string, value?: any, increment?: { key: string, by?: number } };
    
    if (!body.metrics && !body.key && !body.increment) {
      return new Response(JSON.stringify({ error: true, message: 'Either metrics object, key/value pair, or increment must be provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (body.increment) {
      await incrementUserMetric(env.DB, userId, body.increment.key, body.increment.by || 1);
    } else if (body.metrics) {
      await updateUserMetrics(env.DB, userId, body.metrics);
    } else if (body.key !== undefined) {
      await setUserMetric(env.DB, userId, body.key, body.value);
    }
    
    const updatedMetrics = await getUserMetrics(env.DB, userId);
    
    return new Response(JSON.stringify({
      user_id: userId,
      metrics: updatedMetrics
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating metrics:', error);
    return new Response(JSON.stringify({ error: true, message: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
