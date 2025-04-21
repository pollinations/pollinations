#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the MCP server script
const serverPath = path.resolve(__dirname, '../pollinations-mcp-server.js');

// Simple request to list tools
const listToolsRequest = {
  id: "list-tools-request",
  method: "tools/list"
};

// Spawn the server process
const serverProcess = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', process.stderr]
});

// Send the request
serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

// Set a timeout to kill the process after 5 seconds
setTimeout(() => {
  console.log('Timeout reached, killing server process');
  serverProcess.kill();
  process.exit(0);
}, 5000);

// Handle server output
serverProcess.stdout.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    
    if (response.id === listToolsRequest.id) {
      // Check if authentication tools are available
      const authTools = response.tools.filter(tool => 
        ['isAuthenticated', 'getAuthUrl', 'getToken', 'verifyToken', 
         'listReferrers', 'addReferrer', 'removeReferrer'].includes(tool.name)
      );
      
      console.log("\nAuthentication tools available:", authTools.length > 0 ? "Yes" : "No");
      if (authTools.length > 0) {
        console.log("Authentication tools:");
        authTools.forEach(tool => console.log(`- ${tool.name}`));
      }
      
      // Exit the process
      console.log("\nTest completed, exiting...");
      serverProcess.kill();
      process.exit(0);
    }
  } catch (e) {
    console.log('Server output (not JSON):', data.toString());
  }
});

// Handle server exit
serverProcess.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});
