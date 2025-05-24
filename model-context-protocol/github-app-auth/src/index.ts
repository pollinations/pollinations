/**
 * GitHub App Authentication Worker - OAuth 2.1 with JWT
 * 
 * Implements OAuth 2.1 with JWT tokens for Model Context Protocol (MCP) compliance.
 */

import { getUserByGithubId, updateDomainAllowlist } from './db';
import { 
  handleAuthorize,
  handleToken,
  handleMetadataDiscovery,
  handleClientRegistration
} from './auth/oauth-handlers';
import { requireAuth } from './auth/jwt';
import { handleJWKS } from './auth/jwks';
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
    
    // Function to log response before returning
    const logAndReturnResponse = (response: Response, context: string = '') => {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] ${method} ${path} - Response sent (${response.status}) in ${duration}ms ${context}`);
      return response;
    };

    // Simple router
    try {
      // Root path - show documentation
      if (path === '/') {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth 2.1 Authorization Server</title>
            <style>
              body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
              code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
              pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
              .endpoint { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 6px; }
              .method { background: #0969da; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            </style>
          </head>
          <body>
            <h1>OAuth 2.1 Authorization Server</h1>
            <p>This server implements OAuth 2.1 with JWT tokens for Model Context Protocol (MCP) compliance.</p>
            
            <h2>Available Endpoints</h2>
            
            <div class="endpoint">
              <h3><span class="method">GET</span> /.well-known/oauth-authorization-server</h3>
              <p>OAuth 2.0 Authorization Server Metadata discovery endpoint</p>
            </div>
            
            <div class="endpoint">
              <h3><span class="method">GET</span> /authorize</h3>
              <p>Authorization endpoint - requires PKCE parameters</p>
              <pre>Parameters:
- response_type=code
- client_id
- redirect_uri
- code_challenge
- code_challenge_method=S256
- state (optional)</pre>
            </div>
            
            <div class="endpoint">
              <h3><span class="method">POST</span> /token</h3>
              <p>Token exchange endpoint</p>
              <pre>Parameters:
- grant_type=authorization_code|refresh_token
- code (for authorization_code)
- code_verifier (for authorization_code)
- refresh_token (for refresh_token)
- redirect_uri</pre>
            </div>
            
            <div class="endpoint">
              <h3><span class="method">GET</span> /jwks</h3>
              <p>JSON Web Key Set endpoint for token validation</p>
            </div>
            
            <div class="endpoint">
              <h3><span class="method">POST</span> /register</h3>
              <p>Dynamic client registration endpoint</p>
            </div>
          </body>
          </html>
        `;
        return logAndReturnResponse(new Response(html, {
          headers: { 'Content-Type': 'text/html' }
        }));
      }
      
      // OAuth 2.1 endpoints
      if (path === '/.well-known/oauth-authorization-server') {
        const response = await handleMetadataDiscovery(request, env);
        return logAndReturnResponse(response, 'metadata discovery');
      }
      
      if (path === '/authorize') {
        const response = await handleAuthorize(request, env);
        return logAndReturnResponse(response, 'authorization');
      }
      
      if (path === '/token' && method === 'POST') {
        const response = await handleToken(request, env);
        return logAndReturnResponse(response, 'token exchange');
      }
      
      if (path === '/jwks') {
        const response = await handleJWKS(request, env);
        return logAndReturnResponse(response, 'JWKS');
      }
      
      if (path === '/register' && method === 'POST') {
        const response = await handleClientRegistration(request, env);
        return logAndReturnResponse(response, 'client registration');
      }
      
      // GitHub OAuth callback (handled internally by the authorize flow)
      if (path === '/callback') {
        console.log('GitHub OAuth callback received');
        const response = await handleAuthorize(request, env);
        return logAndReturnResponse(response, 'OAuth callback');
      }
      
      // Protected API endpoints (require JWT auth)
      if (path.startsWith('/api/')) {
        const authResult = await requireAuth(request, env);
        // Check if it's an error response
        if (authResult instanceof Response) {
          return logAndReturnResponse(authResult, 'unauthorized');
        }
        
        // Extract user from JWT payload
        const userId = authResult.user.sub;
        
        // Handle protected routes
        if (path === '/api/user' && method === 'GET') {
          const user = await getUserByGithubId(env.DB, userId);
          if (!user) {
            return logAndReturnResponse(new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
          
          return logAndReturnResponse(new Response(JSON.stringify({
            github_user_id: user.github_user_id,
            username: user.username,
            app_installation_id: user.app_installation_id,
            domain_allowlist: user.domain_allowlist ? user.domain_allowlist.split(',') : []
          }), {
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        
        if (path === '/api/user' && method === 'PUT') {
          const body = await request.json() as { domain_allowlist?: string[] };
          
          if (body.domain_allowlist && Array.isArray(body.domain_allowlist)) {
            await updateDomainAllowlist(env.DB, userId, body.domain_allowlist);
            
            return logAndReturnResponse(new Response(JSON.stringify({ 
              success: true,
              domain_allowlist: body.domain_allowlist
            }), {
              headers: { 'Content-Type': 'application/json' }
            }));
          }
          
          return logAndReturnResponse(new Response(JSON.stringify({ error: 'Invalid request body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
      }
      
      // Get user domains endpoint
      if (path.match(/^\/api\/user\/(.+)\/domains$/) && method === 'GET') {
        const matches = path.match(/^\/api\/user\/(.+)\/domains$/);
        if (!matches || matches.length < 2) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Invalid path' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Invalid path'
          );
        }
        
        const githubUserId = decodeURIComponent(matches[1]);
        console.log(`Fetching domains for user: ${githubUserId}`);
        
        try {
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
          
          const domains = user.domain_allowlist ? user.domain_allowlist.split(',').filter(d => d.trim()) : [];
          
          return logAndReturnResponse(
            new Response(JSON.stringify({ domains }), {
              headers: { 'Content-Type': 'application/json' }
            }),
            'Domains fetched'
          );
        } catch (error) {
          console.error('Error fetching user domains:', error);
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Failed to fetch user domains' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Error'
          );
        }
      }
      
      // Get domain allowlist by session ID
      if (path.match(/^\/api\/session\/(.+)\/domains$/) && method === 'GET') {
        const matches = path.match(/^\/api\/session\/(.+)\/domains$/);
        if (!matches || matches.length < 2) {
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Invalid path' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Invalid path'
          );
        }
        
        const sessionId = decodeURIComponent(matches[1]);
        console.log(`Fetching domains for session: ${sessionId}`);
        
        try {
          // Legacy endpoint - return empty for now
          return logAndReturnResponse(
            new Response(JSON.stringify({ 
              domains: [],
              message: 'This endpoint is deprecated. Use JWT authentication instead.'
            }), {
              headers: { 'Content-Type': 'application/json' }
            }),
            'Deprecated endpoint'
          );
        } catch (error) {
          console.error('Error fetching session domains:', error);
          return logAndReturnResponse(
            new Response(JSON.stringify({ error: 'Failed to fetch domains' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }),
            'Error'
          );
        }
      }
      
      // Legacy endpoints - deprecated
      if (path === '/start' || path === '/auth/callback' || path.startsWith('/status/')) {
        return logAndReturnResponse(new Response(JSON.stringify({ 
          error: 'This endpoint has been deprecated. Please use the OAuth 2.1 endpoints.',
          documentation: `${url.origin}/`
        }), {
          status: 410, // Gone
          headers: { 'Content-Type': 'application/json' }
        }), 'deprecated endpoint');
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
          // Removed getAuthSession call
          
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
