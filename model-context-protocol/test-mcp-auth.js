#!/usr/bin/env node

/**
 * Simple test for MCP server auth tools
 * Tests the JWT-based authentication flow
 */

import { spawn } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

// Helper to send JSON-RPC request to MCP server
function sendRequest(proc, method, params = {}, id = 1) {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id
  };
  
  const message = JSON.stringify(request);
  const header = `Content-Length: ${message.length}\r\n\r\n`;
  
  proc.stdin.write(header + message);
}

// Helper to parse JSON-RPC messages
function parseMessages(data) {
  const messages = [];
  const lines = data.toString().split('\r\n');
  
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('Content-Length:')) {
      const length = parseInt(lines[i].split(':')[1].trim());
      i += 2; // Skip empty line
      
      if (i < lines.length && lines[i]) {
        try {
          const json = JSON.parse(lines[i]);
          messages.push(json);
        } catch (e) {
          console.error('Failed to parse JSON:', lines[i]);
        }
      }
    }
    i++;
  }
  
  return messages;
}

async function runTest() {
  console.log(`${colors.bright}${colors.blue}Starting MCP Server Auth Test${colors.reset}\n`);
  
  // Start the MCP server
  const proc = spawn('node', ['pollinations-mcp.js'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });
  
  let buffer = '';
  let codeVerifier = '';
  let state = '';
  
  proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const messages = parseMessages(buffer);
    
    messages.forEach(msg => {
      if (msg.result) {
        console.log(`${colors.green}Response:${colors.reset}`);
        console.log(JSON.stringify(msg.result, null, 2));
        
        // Extract auth info from startAuth response
        if (msg.id === 2 && msg.result.content && msg.result.content[0]) {
          const content = msg.result.content[0].text;
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content);
              if (parsed.codeVerifier) {
                codeVerifier = parsed.codeVerifier;
                state = parsed.state;
                console.log(`\n${colors.yellow}Auth URL:${colors.reset} ${parsed.authUrl}`);
                console.log(`${colors.yellow}Code Verifier saved for token exchange${colors.reset}`);
              }
            } catch (e) {
              // Content might not be JSON
            }
          }
        }
      } else if (msg.error) {
        console.log(`${colors.red}Error:${colors.reset}`);
        console.log(JSON.stringify(msg.error, null, 2));
      } else if (msg.method) {
        // Server notifications
        console.log(`${colors.blue}Server:${colors.reset} ${msg.method}`);
      }
    });
    
    // Clear processed messages from buffer
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      const lastIndex = buffer.lastIndexOf(JSON.stringify(lastMessage));
      if (lastIndex !== -1) {
        buffer = buffer.substring(lastIndex + JSON.stringify(lastMessage).length);
      }
    }
  });
  
  // Wait for server to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Initialize connection
  console.log(`${colors.yellow}Initializing MCP connection...${colors.reset}`);
  sendRequest(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }, 1);
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 1: Start authentication
  console.log(`\n${colors.yellow}Test 1: Starting authentication flow...${colors.reset}`);
  sendRequest(proc, 'tools/call', {
    name: 'startAuth',
    arguments: {}
  }, 2);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Show how to exchange token (requires user interaction)
  console.log(`\n${colors.yellow}Test 2: Token Exchange Example${colors.reset}`);
  console.log('After authenticating at the URL above, you would call:');
  console.log(`${colors.bright}exchangeToken${colors.reset} with:`);
  console.log(`  - code: <authorization code from callback URL>`);
  console.log(`  - codeVerifier: ${codeVerifier ? codeVerifier.substring(0, 20) + '...' : '<saved from startAuth>'}`);
  
  // Test 3: Show available auth tools
  console.log(`\n${colors.yellow}Available Auth Tools:${colors.reset}`);
  console.log('1. startAuth - Start OAuth flow with PKCE');
  console.log('2. exchangeToken - Exchange code for access token');
  console.log('3. refreshToken - Refresh expired access token');
  console.log('4. getDomains - Get allowlisted domains');
  console.log('5. updateDomains - Update allowlisted domains');
  
  // Interactive mode
  console.log(`\n${colors.yellow}Interactive Mode${colors.reset}`);
  console.log('You can now test the auth flow interactively.');
  console.log('Commands:');
  console.log('  exchange <code> - Exchange authorization code for token');
  console.log('  refresh <token> - Refresh an access token');
  console.log('  quit - Exit the test');
  
  const askCommand = () => {
    rl.question('\n> ', (input) => {
      const [cmd, ...args] = input.trim().split(' ');
      
      switch (cmd) {
        case 'exchange':
          if (args[0] && codeVerifier) {
            sendRequest(proc, 'tools/call', {
              name: 'exchangeToken',
              arguments: {
                code: args[0],
                codeVerifier: codeVerifier
              }
            }, 3);
          } else {
            console.log('Usage: exchange <authorization_code>');
            if (!codeVerifier) {
              console.log('Error: No code verifier saved. Run startAuth first.');
            }
          }
          break;
          
        case 'refresh':
          if (args[0]) {
            sendRequest(proc, 'tools/call', {
              name: 'refreshToken',
              arguments: {
                refreshToken: args[0]
              }
            }, 4);
          } else {
            console.log('Usage: refresh <refresh_token>');
          }
          break;
          
        case 'quit':
          console.log('Exiting...');
          proc.kill();
          process.exit(0);
          break;
          
        default:
          console.log('Unknown command. Use: exchange, refresh, or quit');
      }
      
      askCommand();
    });
  };
  
  askCommand();
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\nExiting...');
  process.exit(0);
});

// Run the test
runTest().catch(console.error);
