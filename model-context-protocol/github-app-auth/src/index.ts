/**
 * GitHub App Authentication Worker
 * 
 * A minimal Cloudflare Worker that implements GitHub OAuth following
 * the "thin proxy" design principle.
 */

import { handleAuthStart, handleAuthCallback, handleAuthStatus } from './handlers';
import { getUserByGithubId, updateDomainAllowlist, getAuthSession } from './db';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    console.log(`[${new Date().toISOString()}] ${method} ${path} - Request received`);
    
    // Add request ID for tracing
    const requestId = crypto.randomUUID();
    console.log(`Request ID: ${requestId}`);
    
    // Log request headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log(`Request headers: ${JSON.stringify(headers)}`);
    
    // Function to log response before returning
    const logAndReturnResponse = (response: Response, context: string = '') => {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] ${method} ${path} - Response sent (${response.status}) in ${duration}ms ${context}`);
      return response;
    };

    // Simple router
    try {
      // Root path redirect to /start
      if (path === '/') {
        console.log('Root path accessed, redirecting to /start');
        return Response.redirect(`${url.origin}/start`, 302);
      }
      
      // Health check with detailed information
      if (path === '/health') {
        console.log('Health check requested');
        
        // Check D1 database connection
        let dbStatus = 'unknown';
        try {
          // Simple query to check if DB is accessible
          const result = await env.DB.prepare('SELECT 1 as test').first();
          dbStatus = result && result.test === 1 ? 'connected' : 'error';
          console.log('Database health check:', dbStatus);
        } catch (error) {
          console.error('Database health check error:', error);
          dbStatus = 'error';
        }
        
        const response = new Response(JSON.stringify({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          requestId,
          environment: {
            database: dbStatus
          }
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'X-Request-ID': requestId
          }
        });
        
        return logAndReturnResponse(response, 'Health check');
      }
      
      // Auth start endpoint - Use Arctic-based implementation
      if (path === '/start') {
        console.log('Auth start requested');
        const response = await handleAuthStart(request, env);
        return logAndReturnResponse(response, 'Auth start');
      }
      
      // Auth status endpoint - Use Arctic-based implementation
      if (path.startsWith('/status/')) {
        const sessionId = path.split('/').pop();
        
        if (!sessionId) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Session ID required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Missing session ID'
          );
        }
        
        console.log(`Auth status requested for session: ${sessionId}`);
        const response = await handleAuthStatus(request, env, sessionId);
        return logAndReturnResponse(response, 'Auth status');
      }
      
      // Auth callback endpoint - Use Arctic-based implementation
      if (path === '/callback') {
        console.log('Auth callback received');
        const response = await handleAuthCallback(request, env);
        return logAndReturnResponse(response, 'Auth callback');
      }
      
      // Get user domains endpoint
      if (path.match(/^\/api\/user\/(.+)\/domains$/) && method === 'GET') {
        const matches = path.match(/^\/api\/user\/(.+)\/domains$/);
        const githubUserId = matches ? matches[1] : null;
        
        // Get session ID from request header
        const sessionId = request.headers.get('x-session-id');
        
        if (!sessionId) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Authentication required', message: 'Session ID is required in x-session-id header' }), {
              status: 401,
              headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            }),
            'Authentication required'
          );
        }
        
        if (!githubUserId) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Invalid user ID' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Invalid user ID'
          );
        }
        
        try {
          // First verify the session is valid and belongs to this user
          const session = await getAuthSession(env.DB, sessionId);
          
          if (!session || session.status !== 'complete') {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'Invalid session', message: 'Session is not authenticated' }), {
                status: 401,
                headers: { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              }),
              'Invalid session'
            );
          }
          
          // Verify the session belongs to the requested user
          if (session.github_user_id !== githubUserId) {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'Unauthorized', message: 'Session does not match requested user' }), {
                status: 403,
                headers: { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              }),
              'Unauthorized access'
            );
          }
          
          const user = await getUserByGithubId(env.DB, githubUserId);
          
          if (!user) {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              }),
              'User not found'
            );
          }
          
          const domains = user.domain_allowlist ? JSON.parse(user.domain_allowlist) : [];
          
          return logAndReturnResponse(
            new Response(JSON.stringify({ domains }), {
              headers: { 'Content-Type': 'application/json' }
            }),
            'Domains retrieved'
          );
        } catch (error) {
          console.error('Get domains error:', error);
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Failed to get domains' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Get domains error'
          );
        }
      }
      
      // Update user domains endpoint
      if (path.match(/^\/api\/user\/(.+)\/domains$/) && method === 'PUT') {
        const matches = path.match(/^\/api\/user\/(.+)\/domains$/);
        const githubUserId = matches ? matches[1] : null;
        
        // Get session ID from request header
        const sessionId = request.headers.get('x-session-id');
        
        if (!sessionId) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Authentication required', message: 'Session ID is required in x-session-id header' }), {
              status: 401,
              headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            }),
            'Authentication required'
          );
        }
        
        if (!githubUserId) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Invalid user ID' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Invalid user ID'
          );
        }
        
        try {
          // First verify the session is valid and belongs to this user
          const session = await getAuthSession(env.DB, sessionId);
          
          if (!session || session.status !== 'complete') {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'Invalid session', message: 'Session is not authenticated' }), {
                status: 401,
                headers: { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              }),
              'Invalid session'
            );
          }
          
          // Verify the session belongs to the requested user
          if (session.github_user_id !== githubUserId) {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'Unauthorized', message: 'Session does not match requested user' }), {
                status: 403,
                headers: { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
                }
              }),
              'Unauthorized access'
            );
          }
          
          const user = await getUserByGithubId(env.DB, githubUserId);
          
          if (!user) {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              }),
              'User not found'
            );
          }
          
          const body = await request.json() as { domains: unknown };
          const domains = body.domains;
          
          if (!Array.isArray(domains)) {
            return logAndReturnResponse(
              new Response(JSON.stringify({ error: 'Invalid domains format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
              }),
              'Invalid domains format'
            );
          }
          
          await updateDomainAllowlist(env.DB, githubUserId, domains);
          
          return logAndReturnResponse(
            new Response(JSON.stringify({ success: true, domains }), {
              headers: { 'Content-Type': 'application/json' }
            }),
            'Domains updated'
          );
        } catch (error) {
          console.error('Update domains error:', error);
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Failed to update domains' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Update domains error'
          );
        }
      }

      // Default 404 response
      console.log(`No route matched for ${method} ${path}`);
      const notFoundResponse = new Response(JSON.stringify({ 
        error: 'Not found',
        path,
        requestId
      }), { 
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      });
      
      return logAndReturnResponse(notFoundResponse, 'Route not found');
    } catch (error) {
      const serverError = error as Error;
      console.error('Unhandled error:', serverError);
      
      const errorResponse = new Response(JSON.stringify({ 
        error: 'Internal server error',
        requestId,
        message: serverError.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      });
      
      return logAndReturnResponse(errorResponse, `Unhandled error: ${serverError.message}`);
    }
  }
};
