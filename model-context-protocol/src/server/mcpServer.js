/**
 * Pollinations MCP Server - Main Entry Point
 * 
 * This file serves as the main entry point for the Pollinations MCP server.
 * It follows the "thin proxy" design principle by using stdio transport
 * for communication with MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolDefinitions } from '../index.js';

/**
 * Starts the MCP server with STDIO transport
 */
async function startMcpServer() {
  try {
    // Create the MCP server with tool definitions
    const server = new Server({
      name: 'pollinations-mcp',
      version: '1.0.7'
    }, {
      capabilities: {
        tools: {
          definitions: Object.values(toolDefinitions)
        }
      }
    });
    
    // Create and connect the STDIO transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.log('Pollinations Multimodal MCP server running on stdio');
    
    // Handle process termination
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    
  } catch (error) {
    console.error(`Failed to start MCP server: ${error.message}`);
    process.exit(1);
  }
}

// Start the server
startMcpServer();
