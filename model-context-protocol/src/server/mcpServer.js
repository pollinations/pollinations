/**
 * Pollinations MCP Server - Main Entry Point
 * 
 * This file serves as the main entry point for the Pollinations MCP server.
 * It follows the "thin proxy" design principle by using stdio transport
 * for communication with MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server.js';
import { startServerWithTransport } from './transportSetup.js';
import { toolDefinitions } from '../index.js';

/**
 * Creates and starts the MCP server
 */
async function startMcpServer() {
  try {
    console.error('[SERVER] Creating MCP server');
    
    // Create the MCP server with tool definitions
    const server = new Server({
      name: 'pollinations-mcp',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {
          definitions: Object.values(toolDefinitions)
        }
      }
    });
    
    console.error('[SERVER] MCP server created successfully');
    console.error('[SERVER] Starting server with stdio transport');
    
    // Start the server with stdio transport
    await startServerWithTransport({
      server,
      transport: 'stdio'
    });
    
    console.error('[SERVER] Server started successfully');
    
    // Handle process termination gracefully
    process.on('SIGINT', async () => {
      console.error('[SERVER] Received SIGINT, shutting down...');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.error('[SERVER] Received SIGTERM, shutting down...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`[SERVER ERROR] Failed to start MCP server: ${error.message}`);
    console.error(`[SERVER ERROR STACK] ${error.stack}`);
    process.exit(1);
  }
}

// Start the server
startMcpServer();
