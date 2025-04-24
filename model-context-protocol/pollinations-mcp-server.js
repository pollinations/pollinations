#!/usr/bin/env node

// Import and setup polyfill for AbortController if needed
import { setupAbortControllerPolyfill } from './src/utils/polyfills.js';
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import player from 'play-sound';

// Import service functions and tool definitions
import { toolDefinitions } from './src/index.js';


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
  console.error(`[TOOL REGISTRATION] Registering tool: ${schema.name}`);
  console.error(`[TOOL SCHEMA] ${JSON.stringify(schema, null, 2)}`);

  server.tool(
    schema.name,
    createZodSchemaFromJsonSchema(schema.inputSchema),
    async (params) => {
      console.error(`[TOOL INVOCATION] Tool: ${schema.name}`);
      console.error(`[TOOL PARAMS] ${JSON.stringify(params, null, 2)}`);

      try {
        const result = await handler(params);
        console.error(`[TOOL RESULT] Tool: ${schema.name}, Success: true`);
        console.error(`[TOOL RESULT DATA] ${JSON.stringify(result, null, 2)}`);
        return result;
      } catch (error) {
        console.error(`[TOOL ERROR] Tool: ${schema.name}, Error: ${error.message}`);
        console.error(`[TOOL ERROR STACK] ${error.stack}`);
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
  console.error(`[SERVER] Registering all tools`);
  console.error(`[TOOLS COUNT] Total tools to register: ${Object.keys(toolDefinitions).length}`);

  // Set global audioPlayer for audio tools
  global.audioPlayer = player();
  console.error(`[AUDIO] Audio player initialized`);

  // Register all tools
  Object.values(toolDefinitions).forEach(({ schema, handler }) => {
    registerTool(server, schema, handler);
  });

  console.error(`[SERVER] All tools registered successfully`);
}

// Main function
(async () => {
  try {
    console.error(`[SERVER] Starting Pollinations MCP Server`);
    console.error(`[ENV] Node version: ${process.version}`);
    console.error(`[ENV] Platform: ${process.platform}`);

    // Setup polyfill if needed
    console.error(`[SETUP] Setting up AbortController polyfill`);
    await setupAbortControllerPolyfill();
    console.error(`[SETUP] AbortController polyfill setup complete`);

    // Parse command line arguments
    console.error(`[ARGS] Parsing command line arguments`);
    const argv = yargs(hideBin(process.argv))
      .option('transport', {
        alias: 't',
        description: 'Transport type to use',
        type: 'string',
        choices: ['stdio'],
        default: 'stdio'
      })
      .help()
      .alias('help', 'h')
      .parse();
    console.error(`[ARGS] Command line arguments: ${JSON.stringify(argv, null, 2)}`);


    // GitHub OAuth configuration
    console.error(`[CONFIG] Setting up GitHub OAuth configuration`);
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI || 'https://flow.pollinations.ai/github/callback';
    console.error(`[CONFIG] GitHub Client ID present: ${Boolean(GITHUB_CLIENT_ID)}`);
    console.error(`[CONFIG] GitHub Client Secret present: ${Boolean(GITHUB_CLIENT_SECRET)}`);
    console.error(`[CONFIG] Redirect URI: ${REDIRECT_URI}`);


    // Create the MCP server with higher-level abstractions
    console.error(`[SERVER] Creating MCP server instance`);
    const server = new McpServer({
      name: 'pollinations-multimodal-api',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {}
      }
    });
    console.error(`[SERVER] MCP server instance created successfully`);


    // Set up error handling
    console.error(`[SERVER] Setting up error handling`);
    server.onerror = (error) => {
      console.error('[MCP Error]', error);
      console.error(`[MCP Error Stack] ${error.stack}`);
    };

    process.on('SIGINT', async () => {
      console.error(`[SERVER] Received SIGINT signal, shutting down`);
      await server.close();
      console.error(`[SERVER] Server closed successfully`);
      process.exit(0);
    });

    // Set up additional error handlers
    process.on('uncaughtException', (error) => {
      console.error(`[UNCAUGHT EXCEPTION] ${error.message}`);
      console.error(`[UNCAUGHT EXCEPTION STACK] ${error.stack}`);
    });

    process.on('unhandledRejection', (reason, _promise) => {
      console.error(`[UNHANDLED REJECTION] ${reason}`);
      console.error(`[UNHANDLED REJECTION STACK] ${reason.stack}`);
      console.error(`[UNHANDLED REJECTION] Promise: ${_promise}`);
    });


    // Register all tools
    console.error(`[SERVER] Starting tool registration`);
    registerAllTools(server, toolDefinitions);
    console.error(`[SERVER] Tool registration complete`);


    // Start the server with stdio transport
    console.error(`[SERVER] Starting server with ${argv.transport} transport`);
    await startServerWithTransport({
      server,
      transport: argv.transport
    });
    console.error(`[SERVER] Server started successfully with ${argv.transport} transport`);

  } catch (error) {
    console.error(`[FATAL ERROR] ${error.message}`);
    console.error(`[FATAL ERROR STACK] ${error.stack}`);
    console.error(`[SERVER] Exiting with code 1 due to fatal error`);
    process.exit(1);
  }
})();
