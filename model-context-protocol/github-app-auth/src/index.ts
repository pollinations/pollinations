/**
 * GitHub App Authentication Worker
 * 
 * A minimal Cloudflare Worker that implements GitHub OAuth following
 * the "thin proxy" design principle.
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  REDIRECT_URI: string;
  DB: D1Database;
}

// Define response types for better type safety
interface TokenResponse {
  access_token?: string;
  error?: string;
  [key: string]: any;
}

interface GitHubUserResponse {
  login: string;
  id: number;
  [key: string]: any;
}

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
      
      // Auth start endpoint
      if (path === '/auth/start') {
        // Generate a random state for CSRF protection
        const state = crypto.randomUUID();
        
        // Create GitHub OAuth URL
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(env.REDIRECT_URI)}&scope=user:email&state=${state}`;
        
        // Store state in D1 (simplified for testing)
        const sessionId = crypto.randomUUID();
        
        try {
          await env.DB.prepare(
            `INSERT INTO auth_sessions (session_id, state, status) VALUES (?, ?, ?)`
          )
          .bind(sessionId, state, 'pending')
          .run();
          
          console.log(`Auth session created: ${sessionId}`);
          
          const response = new Response(JSON.stringify({
            sessionId,
            authUrl,
            requestId
          }), {
            headers: { 
              'Content-Type': 'application/json',
              'X-Request-ID': requestId
            }
          });
          
          return logAndReturnResponse(response, 'Auth start');
        } catch (error) {
          const dbError = error as Error;
          console.error('Database error:', dbError);
          return new Response(JSON.stringify({ error: 'Database error', details: dbError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Auth status endpoint
      if (path.startsWith('/auth/status/')) {
        const sessionId = path.split('/').pop();
        
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Session ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        try {
          // Check session status in D1
          const session = await env.DB.prepare(
            `SELECT status, github_user_id FROM auth_sessions WHERE session_id = ?`
          )
          .bind(sessionId)
          .first();
          
          if (!session) {
            return new Response(JSON.stringify({ error: 'Session not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // If session is completed, get user info
          if (session.status === 'completed' && session.github_user_id) {
            const user = await env.DB.prepare(
              `SELECT github_user_id, username, access_token FROM users WHERE github_user_id = ?`
            )
            .bind(session.github_user_id)
            .first();
            
            if (!user) {
              return new Response(JSON.stringify({ error: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
            return new Response(JSON.stringify({
              status: 'completed',
              user: {
                id: String(user.github_user_id).replace('.0', ''),
                login: user.username
              }
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // Return current status
          return new Response(JSON.stringify({
            status: session.status
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          const dbError = error as Error;
          console.error('Database error:', dbError);
          return new Response(JSON.stringify({ error: 'Database error', details: dbError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Auth callback endpoint
      if (path === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        
        if (!code || !state) {
          return new Response(JSON.stringify({ error: 'Missing code or state' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        try {
          // Find session by state
          const session = await env.DB.prepare(
            `SELECT session_id FROM auth_sessions WHERE state = ?`
          )
          .bind(state)
          .first();
          
          if (!session) {
            return new Response(JSON.stringify({ error: 'Invalid state' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // Exchange code for access token - direct fetch, no dependencies
          const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              client_id: env.GITHUB_CLIENT_ID,
              client_secret: env.GITHUB_CLIENT_SECRET,
              code,
              redirect_uri: env.REDIRECT_URI
            })
          });
          
          const tokenData = await tokenResponse.json() as TokenResponse;
          
          if (tokenData.error) {
            return new Response(JSON.stringify({ error: tokenData.error }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          const accessToken = tokenData.access_token;
          
          if (!accessToken) {
            return new Response(JSON.stringify({ error: 'No access token returned' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // Get user data
          const userResponse = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `token ${accessToken}`,
              'Accept': 'application/json',
              'User-Agent': 'GitHub-Auth-App'
            }
          });
          
          const userData = await userResponse.json() as GitHubUserResponse;
          
          // Store user in database
          await env.DB.prepare(
            `INSERT OR REPLACE INTO users (github_user_id, username, access_token) VALUES (?, ?, ?)`
          )
          .bind(String(userData.id), userData.login, accessToken)
          .run();
          
          // Update session status
          await env.DB.prepare(
            `UPDATE auth_sessions SET status = ?, github_user_id = ? WHERE session_id = ?`
          )
          .bind('completed', String(userData.id), session.session_id)
          .run();
          
          // Simple success HTML
          const html = `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Authentication Successful</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                  .success { color: green; }
                </style>
              </head>
              <body>
                <h1 class="success">Authentication Successful!</h1>
                <p>You are authenticated as ${userData.login}</p>
                <p>You can close this window and return to your application.</p>
              </body>
            </html>
          `;
          
          return new Response(html, {
            headers: { 'Content-Type': 'text/html' }
          });
        } catch (error) {
          const authError = error as Error;
          console.error('Auth error:', authError);
          return new Response(JSON.stringify({ error: 'Authentication failed', details: authError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
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
