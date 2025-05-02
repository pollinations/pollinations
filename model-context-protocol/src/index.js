/**
 * Pollinations API Client and MCP Server
 *
 * A simple client for the Pollinations APIs that follows the thin proxy design principle.
 * Also includes the MCP server implementation for stdio transport.
 */

// Import MCP server dependencies
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupAbortControllerPolyfill } from './utils/polyfills.js';
import player from 'play-sound';

// Import tools with their schemas and handlers
import { imageTools } from './services/imageService.js';
import { textTools } from './services/textService.js';
import { audioTools } from './services/audioService.js';
import { resourceTools } from './services/resourceService.js';
import { authTools } from './services/authService.js';

// Export all tools as a flat array
const toolDefinitions = [
  // Image tools
  ...imageTools,

  // Text tools
  ...textTools,

  // Audio tools
  ...audioTools,
  ...authTools,
  // Resource tools
  // ...resourceTools
];

/**
 * Starts the MCP server with STDIO transport
 */
export async function startMcpServer() {
  try {
    // Setup AbortController polyfill for older Node.js versions
    // await setupAbortControllerPolyfill();
    
    try {
      // Initialize audio player for audio tools
      global.audioPlayer = player();
    } catch (error) {
      console.error('Failed to initialize audio player:', error);
    }
    
    // Create the MCP server with tool definitions
    const server = new McpServer({
      name: 'pollinations-mcp',
      version: '1.0.7',
      capabilities: {
        tools: {}
      }
    });
    
    // Register all tools using the spread operator to pass the tool definition arrays
    toolDefinitions.forEach(tool => server.tool(...tool));
  
    // Set up error handler for the server
    server.onerror = (error) => {
      console.error(`Server error: ${error.message}`);
    };
    
    // Set up additional error handlers
    process.on('uncaughtException', (error) => {
      console.error(`Uncaught exception: ${error.message}`);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error(`Unhandled rejection: ${reason}`);
    });
    
    // Create and connect the STDIO transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Pollinations Multimodal MCP server running on stdio');
    
    // Handle process termination
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    
  } catch (error) {
    console.error(`Failed to start MCP server: ${error.message}`);
    process.exit(1);
  }
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer();
}
