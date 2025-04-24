// Transport setup functions for the Pollinations MCP server
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Starts the MCP server with the stdio transport
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @param {string} options.transport - Transport type (stdio)
 * @returns {Promise<void>}
 */
export async function startServerWithTransport({
  server,
  transport
}) {
  console.error(`[TRANSPORT] Starting server with transport: ${transport}`);
  try {
    if (transport === 'stdio') {
      // Use STDIO transport
      console.error(`[TRANSPORT] Using STDIO transport`);
      await startStdioTransport({ server });
    } else {
      console.error(`[TRANSPORT ERROR] Unsupported transport: ${transport}`);
      throw new Error(`Unsupported transport: ${transport}`);
    }
  } catch (error) {
    console.error(`[TRANSPORT ERROR] Error starting server: ${error.message}`);
    console.error(`[TRANSPORT ERROR STACK] ${error.stack}`);
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
  console.error(`[STDIO] Initializing STDIO transport`);
  const transport = new StdioServerTransport();
  console.error(`[STDIO] STDIO transport initialized`);

  console.error(`[STDIO] Connecting server to STDIO transport`);
  try {
    await server.connect(transport);
    console.error(`[STDIO] Server successfully connected to STDIO transport`);
    console.log('Pollinations Multimodal MCP server running on stdio');
  } catch (error) {
    console.error(`[STDIO ERROR] Failed to connect server to STDIO transport: ${error.message}`);
    console.error(`[STDIO ERROR STACK] ${error.stack}`);
    throw error;
  }
}


