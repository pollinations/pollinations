#!/usr/bin/env node

// Import and setup polyfill for AbortController if needed
import { setupAbortControllerPolyfill } from './src/utils/polyfills.js';
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import os from 'os';
import path from 'path';
import fs from 'fs';
import player from 'play-sound';

// Import service functions and tool definitions
import { toolDefinitions } from './src/index.js';

// Import authentication functions
import {
  verifyToken,
  verifyReferrer
} from './src/services/authService.js';

// Import schema utilities
import { createZodSchemaFromJsonSchema } from './src/utils/schemaUtils.js';

// Import server transport setup
import { startServerWithTransport } from './src/server/transportSetup.js';

/**
 * Utility function to register a tool with the server
 * 
 * @param {McpServer} server - The MCP server instance
 * @param {Object} schema - The tool schema
 * @param {Function} handler - The function that handles the tool
 */
function registerTool(server, schema, handler) {
  server.tool(
    schema.name,
    createZodSchemaFromJsonSchema(schema.inputSchema),
    async (params) => {
      try {
        return await handler(params);
      } catch (error) {
        return {
          content: [
            { type: 'text', text: `Error: ${error.message}` }
          ],
          isError: true
        };
      }
    }
  );
}

/**
 * Utility function to register all tools with the server
 * 
 * @param {McpServer} server - The MCP server instance
 * @param {Object} toolDefinitions - The tool definitions object
 */
function registerAllTools(server, toolDefinitions) {
  // Set global audioPlayer for audio tools
  global.audioPlayer = player();
  
  // Register all tools
  Object.values(toolDefinitions).forEach(({ schema, handler }) => {
    registerTool(server, schema, handler);
  });
}

// Main function
(async () => {
  try {
    // Setup polyfill if needed
    await setupAbortControllerPolyfill();

    // Parse command line arguments
    const argv = yargs.default(hideBin(process.argv))
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
        default: 31122
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
    const REDIRECT_URI = process.env.REDIRECT_URI || 'https://flow.pollinations.ai/github/callback';

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

    // Register all tools
    registerAllTools(server, toolDefinitions);

    // Start the server with the selected transport
    await startServerWithTransport({
      server,
      transport: argv.transport,
      port: argv.port,
      tunnelConfig: argv['tunnel-config'],
      authConfig: {
        githubClientId: GITHUB_CLIENT_ID,
        githubClientSecret: GITHUB_CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
        verifyToken,
        verifyReferrer
      }
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();