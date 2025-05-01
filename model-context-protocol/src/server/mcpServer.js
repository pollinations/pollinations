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
    console.error('[SERVER] Creating MCP server');
    
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
    
    console.error('[SERVER] MCP server created successfully');
    console.error('[STDIO] Initializing STDIO transport');
    
    // Create and connect the STDIO transport
    const transport = new StdioServerTransport();
    
    console.error('[STDIO] STDIO transport initialized');
    console.error('[STDIO] Connecting server to STDIO transport');
    
    try {
      await server.connect(transport);
      console.error('[STDIO] Server successfully connected to STDIO transport');
      console.log('Pollinations Multimodal MCP server running on stdio');
      
      // Handle process termination gracefully
      process.on('SIGINT', () => {
        console.error('[SERVER] Received SIGINT, shutting down...');
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.error('[SERVER] Received SIGTERM, shutting down...');
        process.exit(0);
      });
    } catch (error) {
      console.error(`[STDIO ERROR] Failed to connect server to STDIO transport: ${error.message}`);
      console.error(`[STDIO ERROR] ${error.stack}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`[SERVER ERROR] Failed to start MCP server: ${error.message}`);
    console.error(`[SERVER ERROR] ${error.stack}`);
    process.exit(1);
  }
}

// Start the server
startMcpServer();
