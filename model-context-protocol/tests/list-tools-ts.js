#!/usr/bin/env node

/**
 * Simple script to list all available tools in the Pollinations MCP server
 * 
 * This script uses the official MCP TypeScript SDK to connect to the server
 * and list all available tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import fetch from 'node-fetch';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:31244';

// Main function to list all tools
async function listTools() {
  console.log('Listing all available tools in the Pollinations MCP server...');
  console.log(`Server URL: ${SERVER_URL}`);
  
  try {
    // Create SSE transport for the MCP client
    const transport = new SSEClientTransport({
      sseUrl: `${SERVER_URL}/sse`,
      postUrl: `${SERVER_URL}/messages`,
      fetch
    });

    // Create and connect the MCP client
    const client = new Client({
      name: 'pollinations-tool-lister',
      version: '1.0.0'
    });
    
    await client.connect(transport);
    console.log('Connected to MCP server');

    // List all tools
    const tools = await client.listTools();
    
    if (tools && tools.tools) {
      const toolNames = Object.keys(tools.tools);
      
      console.log(`\nFound ${toolNames.length} tools:`);
      
      if (toolNames.length === 0) {
        console.log('No tools found in server capabilities');
      } else {
        // Sort tools alphabetically
        toolNames.sort().forEach(toolName => {
          console.log(`- ${toolName}`);
        });
      }
    } else {
      console.log('No tools found in server capabilities');
    }
    
    // Close the connection
    await client.close();
    console.log('\nConnection closed');
    
  } catch (error) {
    console.error('Error listing tools:', error);
  }
}

// Run the script
listTools().catch(console.error);
