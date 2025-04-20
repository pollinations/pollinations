import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { getAllToolSchemas } from './toolSchemas.js';
import { SseServerTransport } from './sseTransport.js';
import { createAuthMiddleware } from '../auth/middleware.js';

/**
 * Initialize the MCP server
 * @param {object} app - Express app
 * @param {object} storage - Storage instance
 */
export async function initializeMcpServer(app, storage) {
  // Store storage in app for access in middleware
  app.set('storage', storage);
  
  // Create MCP server instance
  const server = new Server(
    {
      name: 'pollinations-flow-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  
  // Set up error handling
  server.onerror = (error) => console.error('[MCP Error]', error);
  
  // Set up tool handlers
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getAllToolSchemas()
  }));
  
  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Authentication tools
    if (name === 'isAuthenticated') {
      try {
        const { sessionId } = args;
        const user = storage.getUserByToken(sessionId);
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ authenticated: !!user }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else if (name === 'getAuthUrl') {
      try {
        const { returnUrl } = args;
        
        // Build the auth URL
        const baseUrl = `https://${process.env.APP_DOMAIN || 'flow.pollinations.ai'}`;
        const authUrl = `${baseUrl}/github/login`;
        
        // Add return URL if specified
        const redirectUrl = returnUrl ? `${authUrl}?return_url=${encodeURIComponent(returnUrl)}` : authUrl;
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ authUrl: redirectUrl }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else if (name === 'getToken') {
      try {
        const { sessionId } = args;
        const user = storage.getUserByToken(sessionId);
        
        if (!user) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'User not authenticated' }) }
            ],
            isError: true
          };
        }
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ token: user.pollinations_token }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else if (name === 'listReferrers') {
      try {
        const { sessionId } = args;
        const user = storage.getUserByToken(sessionId);
        
        if (!user) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'User not authenticated' }) }
            ],
            isError: true
          };
        }
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ referrers: user.referrers || [] }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else if (name === 'addReferrer') {
      try {
        const { sessionId, referrer } = args;
        const user = storage.getUserByToken(sessionId);
        
        if (!user) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'User not authenticated' }) }
            ],
            isError: true
          };
        }
        
        if (!referrer) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Referrer is required' }) }
            ],
            isError: true
          };
        }
        
        const referrers = await storage.addReferrer(user.github_id, referrer);
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ referrers }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else if (name === 'removeReferrer') {
      try {
        const { sessionId, referrer } = args;
        const user = storage.getUserByToken(sessionId);
        
        if (!user) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'User not authenticated' }) }
            ],
            isError: true
          };
        }
        
        if (!referrer) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Referrer is required' }) }
            ],
            isError: true
          };
        }
        
        const referrers = await storage.removeReferrer(user.github_id, referrer);
        
        return {
          content: [
            { type: 'text', text: JSON.stringify({ referrers }) }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }) }
          ],
          isError: true
        };
      }
    } else {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }
  });
  
  // Create SSE endpoint for MCP
  app.get('/mcp', createAuthMiddleware({ allowToken: true }), async (req, res) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial ping to establish connection
    res.write('event: ping\ndata: {}\n\n');
    
    // Create transport
    const transport = new SseServerTransport(req, res);
    
    // Connect transport to server
    await server.connect(transport);
    
    // Handle client disconnect
    req.on('close', async () => {
      console.log('Client disconnected');
      await server.disconnect();
    });
  });
  
  return server;
}
