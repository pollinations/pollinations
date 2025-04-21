// Server setup functions for the Pollinations MCP server
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createGithubAuthHandlers } from '../handlers/githubAuthHandlers.js';
import { createApiAuthHandlers } from '../handlers/apiAuthHandlers.js';
import { createSseHandlers } from '../handlers/sseHandlers.js';

/**
 * Creates and configures an Express app for the MCP server
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @param {string} options.githubClientId - GitHub OAuth client ID
 * @param {string} options.githubClientSecret - GitHub OAuth client secret
 * @param {string} options.redirectUri - OAuth redirect URI
 * @param {Function} options.verifyToken - Function to verify tokens
 * @param {Function} options.verifyReferrer - Function to verify referrers
 * @returns {Object} Express app
 */
export function createExpressApp({ 
  server, 
  githubClientId, 
  githubClientSecret, 
  redirectUri,
  verifyToken,
  verifyReferrer
}) {
  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  // Configure CORS to allow specific origins
  app.use(cors({
    origin: ['https://text.pollinations.ai', 'https://image.pollinations.ai', 'http://localhost:3000', 'https://flow.pollinations.ai'],
    credentials: true
  }));
  
  // Create handlers
  const { handleSseConnection, handlePostMessage } = createSseHandlers({ server });
  
  const { 
    handleGithubLogin, 
    handleGithubCallback 
  } = createGithubAuthHandlers({ 
    clientId: githubClientId, 
    clientSecret: githubClientSecret, 
    redirectUri,
    verifyToken
  });
  
  const { 
    handleVerifyToken, 
    handleVerifyReferrer,
    handleHealthCheck
  } = createApiAuthHandlers({ 
    verifyToken, 
    verifyReferrer 
  });
  
  // Set up routes
  // SSE endpoint for server-to-client streaming
  app.get('/sse', handleSseConnection);
  
  // Message endpoint for client-to-server communication
  app.post('/messages', express.json(), handlePostMessage);
  
  // GitHub OAuth routes
  app.get('/github/login', handleGithubLogin);
  app.get('/github/callback', handleGithubCallback);
  
  // API authentication routes
  app.post('/api/auth/verify-token', handleVerifyToken);
  app.post('/api/auth/verify-referrer', handleVerifyReferrer);
  
  // Health check endpoint
  app.get('/health', handleHealthCheck);
  
  return app;
}

/**
 * Starts the Express server
 * @param {Object} app - Express app
 * @param {number} port - Port to listen on
 * @returns {Promise<Object>} HTTP server
 */
export function startExpressServer(app, port) {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`Pollinations integrated MCP+Auth server running on http://localhost:${port}`);
        console.error(`SSE endpoint: http://localhost:${port}/sse`);
        console.error(`GitHub OAuth: http://localhost:${port}/github/login`);
        resolve(server);
      });
    } catch (error) {
      reject(error);
    }
  });
}
