// Transport setup functions for the Pollinations MCP server
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createExpressApp, startExpressServer } from './serverSetup.js';
import { startCloudflareServer } from './cloudflareSetup.js';

/**
 * Starts the MCP server with the selected transport
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @param {string} options.transport - Transport type (stdio, sse, tunnel)
 * @param {number} options.port - Port for HTTP server
 * @param {string} options.tunnelConfig - Path to Cloudflare tunnel config
 * @param {Object} options.authConfig - Authentication configuration
 * @returns {Promise<void>}
 */
export async function startServerWithTransport({ 
  server, 
  transport, 
  port, 
  tunnelConfig,
  authConfig
}) {
  try {
    if (transport === 'stdio') {
      // Use STDIO transport
      await startStdioTransport({ server });
    } else if (transport === 'sse') {
      // Use SSE transport with integrated authentication
      await startSseTransport({ server, port, authConfig });
    } else if (transport === 'tunnel') {
      // Use Cloudflare tunnel with SSE transport
      await startTunnelTransport({ server, port, tunnelConfig, authConfig });
    } else {
      throw new Error(`Unsupported transport: ${transport}`);
    }
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

/**
 * Starts the MCP server with STDIO transport
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @returns {Promise<void>}
 */
async function startStdioTransport({ server }) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Pollinations Multimodal MCP server running on stdio');
}

/**
 * Starts the MCP server with SSE transport
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @param {number} options.port - Port for HTTP server
 * @param {Object} options.authConfig - Authentication configuration
 * @returns {Promise<Object>} HTTP server
 */
async function startSseTransport({ server, port, authConfig }) {
  // Create Express app with SSE transport
  const app = createExpressApp({ 
    server, 
    ...authConfig
  });
  
  // Start the server
  return await startExpressServer(app, port);
}

/**
 * Starts the MCP server with Cloudflare tunnel transport
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @param {number} options.port - Port for HTTP server
 * @param {string} options.tunnelConfig - Path to Cloudflare tunnel config
 * @param {Object} options.authConfig - Authentication configuration
 * @returns {Promise<Object>} HTTP server
 */
async function startTunnelTransport({ server, port, tunnelConfig, authConfig }) {
  // First start the SSE server
  const httpServer = await startSseTransport({ server, port, authConfig });
  
  // Then start the Cloudflare tunnel
  await startCloudflareServer({ 
    port, 
    configPath: tunnelConfig,
    server
  });
  
  return httpServer;
}
