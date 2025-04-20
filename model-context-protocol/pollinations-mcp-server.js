#!/usr/bin/env node

// Check Node.js version and provide polyfill for AbortController if needed
// This needs to be done before importing any modules that might use AbortController
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

// Show version info
console.error(`Running on Node.js version: ${nodeVersion}`);

// Add AbortController polyfill for Node.js versions < 16
if (majorVersion < 16) {
  // Check if AbortController is already defined globally
  if (typeof global.AbortController === 'undefined') {
    console.error('Adding AbortController polyfill for Node.js < 16');
    try {
      // Try to dynamically import a polyfill
      // First attempt to use node-abort-controller if it's installed
      try {
        const { AbortController: AbortControllerPolyfill } = await import('node-abort-controller');
        global.AbortController = AbortControllerPolyfill;
      } catch (importError) {
        // Create a basic implementation if the import fails
        console.error('Using basic AbortController polyfill');
        
        class AbortSignal {
          constructor() {
            this.aborted = false;
            this.onabort = null;
            this._eventListeners = {};
          }
          
          addEventListener(type, listener) {
            if (!this._eventListeners[type]) {
              this._eventListeners[type] = [];
            }
            this._eventListeners[type].push(listener);
          }
          
          removeEventListener(type, listener) {
            if (!this._eventListeners[type]) return;
            this._eventListeners[type] = this._eventListeners[type].filter(l => l !== listener);
          }
          
          dispatchEvent(event) {
            if (event.type === 'abort' && this.onabort) {
              this.onabort(event);
            }
            
            if (this._eventListeners[event.type]) {
              this._eventListeners[event.type].forEach(listener => listener(event));
            }
          }
        }
        
        global.AbortController = class AbortController {
          constructor() {
            this.signal = new AbortSignal();
          }
          
          abort() {
            if (this.signal.aborted) return;
            this.signal.aborted = true;
            const event = { type: 'abort' };
            this.signal.dispatchEvent(event);
          }
        };
      }
    } catch (error) {
      console.error('Failed to add AbortController polyfill:', error);
      console.error('This package requires Node.js >= 16. Please upgrade your Node.js version.');
      process.exit(1);
    }
  }
}

// Now import the MCP SDK and other modules
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';
import player from 'play-sound';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Initialize audio player
const audioPlayer = player();

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('transport', {
    alias: 't',
    description: 'Transport type to use',
    type: 'string',
    choices: ['stdio', 'sse', 'tunnel'],
    default: 'stdio'
  })
  .option('port', {
    alias: 'p',
    description: 'Port for HTTP server (when using SSE or tunnel transport)',
    type: 'number',
    default: 3000
  })
  .option('tunnel-config', {
    description: 'Path to Cloudflare tunnel configuration file',
    type: 'string',
    default: './cloudflared-config.yml'
  })
  .help()
  .alias('help', 'h')
  .parse();

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 
  (process.env.NODE_ENV === 'development' ? 
    `http://localhost:${argv.port}/github/callback` : 
    'https://flow.pollinations.ai/github/callback');

// Create the MCP server with higher-level abstractions
const server = new McpServer({
  name: 'pollinations-multimodal-api',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {}
  }
});

// Set up error handling
server.onerror = (error) => console.error('[MCP Error]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Define tools using the higher-level SDK abstractions
server.tool(
  'generateImageUrl',
  {
    prompt: z.string().describe('Text prompt for image generation'),
    options: z.object({
      model: z.string().optional().describe('Model to use for image generation'),
      width: z.number().optional().describe('Width of the image'),
      height: z.number().optional().describe('Height of the image'),
      seed: z.number().optional().describe('Seed for reproducible generation')
    }).optional().describe('Additional options for image generation')
  },
  async ({ prompt, options = {} }) => {
    try {
      const result = await generateImageUrl(prompt, options);
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating image URL: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  'generateImage',
  {
    prompt: z.string().describe('Text prompt for image generation'),
    options: z.object({
      model: z.string().optional().describe('Model to use for image generation'),
      width: z.number().optional().describe('Width of the image'),
      height: z.number().optional().describe('Height of the image'),
      seed: z.number().optional().describe('Seed for reproducible generation')
    }).optional().describe('Additional options for image generation')
  },
  async ({ prompt, options = {} }) => {
    try {
      const result = await generateImage(prompt, options);
      return {
        content: [
          {
            type: 'image',
            data: result.data,
            mimeType: result.mimeType
          },
          {
            type: 'text',
            text: `Generated image from prompt: "${prompt}"\n\nImage metadata: ${JSON.stringify(result.metadata, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating image: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  'respondAudio',
  {
    prompt: z.string().describe('Text to convert to speech'),
    voice: z.string().optional().describe('Voice to use for speech'),
    seed: z.number().optional().describe('Seed for reproducible generation'),
    voiceInstructions: z.string().optional().describe('Additional instructions for the voice')
  },
  async ({ prompt, voice, seed, voiceInstructions }) => {
    try {
      const result = await respondAudio(prompt, voice, seed, voiceInstructions);

      // Save audio to a temporary file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `pollinations-audio-${Date.now()}.mp3`);

      // Decode base64 and write to file
      fs.writeFileSync(tempFilePath, Buffer.from(result.data, 'base64'));

      // Play the audio file
      audioPlayer.play(tempFilePath, (err) => {
        if (err) console.error('Error playing audio:', err);

        // Clean up the temporary file after playing
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          console.error('Error cleaning up temp file:', cleanupErr);
        }
      });

      return {
        content: [
          {
            type: 'audio',
            data: result.data,
            mimeType: 'audio/mpeg'
          },
          {
            type: 'text',
            text: `Generated audio from text: "${prompt}"`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error generating audio: ${error.message}` }
        ],
        isError: true
      };
    }
  }
);

// Add more tools using the same pattern...
// (For brevity, I'm not including all tools, but you would add them in the same way)

// Import the service functions
import { 
  generateImageUrl, 
  generateImage, 
  respondAudio, 
  sayText,
  listModels,
  listImageModels,
  listTextModels,
  listAudioVoices,
  generateText,
  listResources,
  listPrompts
} from './src/index.js';

// Import authentication functions
import {
  isAuthenticated,
  getAuthUrl,
  getToken,
  verifyToken,
  verifyReferrer,
  listReferrers,
  addReferrer,
  removeReferrer
} from './src/services/authService.js';

// Run the server with the selected transport
async function run() {
  try {
    if (argv.transport === 'stdio') {
      // Use STDIO transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.log('Pollinations Multimodal MCP server running on stdio');
    } else if (argv.transport === 'sse') {
      // Use SSE transport with integrated authentication
      await runSseServer(argv.port);
    } else if (argv.transport === 'tunnel') {
      // Use Cloudflare tunnel with SSE transport
      await runCloudflareServer(argv.port, argv['tunnel-config']);
    }
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Run the server with SSE transport and integrated authentication
async function runSseServer(port) {
  // Create Express app for SSE transport and authentication
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  // Configure CORS to allow specific origins
  app.use(cors({
    origin: ['https://text.pollinations.ai', 'https://image.pollinations.ai', 'http://localhost:3000', 'https://flow.pollinations.ai'],
    credentials: true
  }));
  
  // SSE endpoint for server-to-client streaming
  app.get('/sse', (req, res) => {
    console.error('SSE connection established');
    
    // Let the SDK handle the SSE transport
    const sseTransport = new SSEServerTransport('/messages', res);
    
    // Connect the MCP server to the SSE transport
    server.connect(sseTransport).catch(error => {
      console.error('Error connecting SSE transport:', error);
    });
  });
  
  // The SDK's SSEServerTransport will handle the /messages endpoint automatically
  
  // GitHub OAuth login
  app.get('/github/login', async (req, res) => {
    const { returnUrl } = req.query;
    
    // Generate a random state to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state and return URL in cookies
    res.cookie('oauth_state', state, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV !== 'development',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
    
    if (returnUrl) {
      res.cookie('return_url', returnUrl, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 10 * 60 * 1000 // 10 minutes
      });
    }
    
    // Redirect to GitHub OAuth
    const redirectUri = encodeURIComponent(REDIRECT_URI);
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;
    res.redirect(authUrl);
  });
  
  // GitHub OAuth callback
  app.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies.oauth_state;
    const returnUrl = req.cookies.return_url || '';
    
    // Verify state to prevent CSRF
    if (!storedState || state !== storedState) {
      return res.status(400).send('Invalid state parameter');
    }
    
    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI
        })
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error('GitHub OAuth error:', tokenData.error);
        return res.status(400).send(`GitHub OAuth error: ${tokenData.error}`);
      }
      
      const accessToken = tokenData.access_token;
      
      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      const userData = await userResponse.json();
      
      if (userResponse.status !== 200) {
        console.error('GitHub API error:', userData);
        return res.status(400).send('Failed to get user data from GitHub');
      }
      
      // Generate a session ID
      const userId = userData.id.toString();
      
      // Set user ID cookie
      res.cookie('userId', userId, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // Clear OAuth cookies
      res.clearCookie('oauth_state');
      res.clearCookie('return_url');
      
      // Redirect to return URL or success page
      if (returnUrl) {
        res.redirect(returnUrl);
      } else {
        res.send(`
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                .success { color: green; }
                .info { margin: 20px 0; }
                .button { 
                  display: inline-block; 
                  padding: 10px 20px; 
                  background-color: #4CAF50; 
                  color: white; 
                  text-decoration: none; 
                  border-radius: 4px; 
                }
              </style>
            </head>
            <body>
              <h1 class="success">Authentication Successful!</h1>
              <p class="info">You are now authenticated as ${userData.login}.</p>
              <p>You can close this window and return to your application.</p>
              <a class="button" href="javascript:window.close()">Close Window</a>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('Error in GitHub OAuth callback:', error);
      res.status(500).send('Authentication error');
    }
  });
  
  // Token verification endpoint
  app.post('/api/auth/verify-token', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }
    
    try {
      const result = await verifyToken(token);
      res.json(result);
    } catch (error) {
      console.error('Error verifying token:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  });
  
  // Referrer verification endpoint
  app.post('/api/auth/verify-referrer', async (req, res) => {
    const { userId, referrer } = req.body;
    
    if (!userId || !referrer) {
      return res.status(400).json({ 
        valid: false, 
        error: 'User ID and referrer are required' 
      });
    }
    
    try {
      const result = await verifyReferrer(userId, referrer);
      res.json(result);
    } catch (error) {
      console.error('Error verifying referrer:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  // Start the server
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`Pollinations integrated MCP+Auth server running on http://localhost:${port}`);
        console.error(`SSE endpoint: http://localhost:${port}/sse`);
        console.error(`GitHub OAuth: http://localhost:${port}/github/login`);
        resolve(server);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Run the server with Cloudflare tunnel and SSE transport
async function runCloudflareServer(port, configPath) {
  // First start the SSE server
  const httpServer = await runSseServer(port);
  
  // Check if cloudflared is installed
  try {
    const { spawn } = await import('child_process');
    
    // Check if the config file exists
    if (!fs.existsSync(configPath)) {
      console.error(`Cloudflare tunnel config file not found: ${configPath}`);
      console.error('Please run the setup-cloudflare-tunnel.sh script first');
      process.exit(1);
    }
    
    // Parse the config file to get the tunnel ID
    const tunnelConfig = fs.readFileSync(configPath, 'utf8');
    const tunnelMatch = tunnelConfig.match(/tunnel:\s*([a-f0-9-]+)/);
    const tunnelId = tunnelMatch ? tunnelMatch[1] : null;
    
    if (!tunnelId) {
      console.error('Could not find tunnel ID in config file');
      console.error('Please run the setup-cloudflare-tunnel.sh script again');
      process.exit(1);
    }
    
    // Start the cloudflared tunnel using the direct run command
    // This is more reliable than using the config file
    console.error(`Starting Cloudflare tunnel with ID: ${tunnelId}`);
    console.error(`Tunnel will be available at flow.pollinations.ai`);
    
    const cloudflared = spawn('cloudflared', ['tunnel', 'run', '--url', `http://localhost:${port}`, tunnelId], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Handle cloudflared output
    cloudflared.stdout.on('data', (data) => {
      console.error(`[Cloudflare Tunnel] ${data.toString().trim()}`);
    });
    
    cloudflared.stderr.on('data', (data) => {
      console.error(`[Cloudflare Tunnel Error] ${data.toString().trim()}`);
    });
    
    // Handle cloudflared exit
    cloudflared.on('exit', (code) => {
      console.error(`Cloudflare tunnel exited with code ${code}`);
      if (code !== 0) {
        console.error('Tunnel failed, but HTTP server will continue running');
        console.error('You can try running the tunnel manually with:');
        console.error(`cloudflared tunnel run --url http://localhost:${port} ${tunnelId}`);
      }
    });
    
    // Handle process exit to clean up the tunnel
    process.on('SIGINT', async () => {
      console.error('Shutting down Cloudflare tunnel...');
      cloudflared.kill();
      await server.close();
      process.exit(0);
    });
    
    // Return the HTTP server
    return httpServer;
  } catch (error) {
    console.error('Error starting Cloudflare tunnel:', error);
    console.error('Continuing with HTTP server only');
    return httpServer;
  }
}

// Start the server
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});