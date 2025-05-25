import type { Env } from './types';

/**
 * Handle admin database dump request
 * This endpoint returns all database tables for admin purposes
 * Uses a simple hardcoded API key from environment variables
 */
export async function handleAdminDatabaseDump(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Verify admin API key
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== env.ADMIN_API_KEY) {
    return new Response(JSON.stringify({
      error: true,
      message: 'Unauthorized: Invalid admin API key'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Direct SQL queries to get all data
    const users = await env.DB.prepare('SELECT * FROM users').all();
    const domains = await env.DB.prepare('SELECT * FROM domains').all();
    const apiTokens = await env.DB.prepare('SELECT * FROM api_tokens').all();
    const oauthStates = await env.DB.prepare('SELECT * FROM oauth_state').all();
    
    // Return all data as JSON
    return new Response(JSON.stringify({
      users: users.results,
      domains: domains.results,
      apiTokens: apiTokens.results,
      oauthStates: oauthStates.results,
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
