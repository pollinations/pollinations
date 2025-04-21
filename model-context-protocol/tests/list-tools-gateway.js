#!/usr/bin/env node

/**
 * Simple script to list all available tools in the Pollinations MCP server
 * 
 * This script uses the supergateway to connect to the server and list all tools.
 * Run this after starting the supergateway with:
 * npx supergateway --sse https://flow.pollinations.ai/sse
 */

import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Send capabilities request
console.log('Sending capabilities request to the MCP server...');
const request = {
  type: 'capabilities'
};

// Write the request to stdout (which supergateway will forward to the MCP server)
process.stdout.write(JSON.stringify(request) + '\n');

// Listen for responses from the MCP server (via supergateway)
process.stdin.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    
    if (response.type === 'capabilities') {
      const tools = response.capabilities?.tools || {};
      const toolNames = Object.keys(tools);
      
      console.log(`\nFound ${toolNames.length} tools:`);
      
      if (toolNames.length === 0) {
        console.log('No tools found in server capabilities');
      } else {
        // Sort tools alphabetically
        toolNames.sort().forEach(toolName => {
          console.log(`- ${toolName}`);
        });
      }
      
      // Exit after receiving capabilities
      process.exit(0);
    }
  } catch (error) {
    console.error('Error parsing response:', error);
  }
});

// Handle errors
process.stdin.on('error', (error) => {
  console.error('Error reading from stdin:', error);
  process.exit(1);
});

// Exit if no response received within 10 seconds
setTimeout(() => {
  console.error('Timeout waiting for response from MCP server');
  process.exit(1);
}, 10000);
