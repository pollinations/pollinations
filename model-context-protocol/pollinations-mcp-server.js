#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { generateImageUrl, listModels, generateImage } from './src/index.js';

// Create the server instance
const server = new Server(
  {
    name: 'pollinations-image-api',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Set up error handling
server.onerror = (error) => console.error('[MCP Error]', error);
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Set up tool handlers
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generateImageUrl',
      description: 'Generate an image URL from a text prompt',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The text description of the image to generate'
          },
          options: {
            type: 'object',
            description: 'Additional options for image generation',
            properties: {
              model: {
                type: 'string',
                description: 'Model name to use for generation'
              },
              seed: {
                type: 'number',
                description: 'Seed for reproducible results'
              },
              width: {
                type: 'number',
                description: 'Width of the generated image'
              },
              height: {
                type: 'number',
                description: 'Height of the generated image'
              }
            },
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'generateImage',
      description: 'Generate an image from a text prompt and return the image data',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The text description of the image to generate'
          },
          options: {
            type: 'object',
            description: 'Additional options for image generation',
            properties: {
              model: {
                type: 'string',
                description: 'Model name to use for generation'
              },
              seed: {
                type: 'number',
                description: 'Seed for reproducible results'
              },
              width: {
                type: 'number',
                description: 'Width of the generated image'
              },
              height: {
                type: 'number',
                description: 'Height of the generated image'
              }
            },
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'listModels',
      description: 'List available image generation models',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'generateImageUrl') {
    try {
      const { prompt, options = {} } = args;
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
  } else if (name === 'generateImage') {
    try {
      const { prompt, options = {} } = args;
      const result = await generateImage(prompt, options);
      return {
        content: [
          { 
            type: 'image',
            data: result.data,
            mimeType: result.mimeType
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
  } else if (name === 'listModels') {
    try {
      const result = await listModels();
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error listing models: ${error.message}` }
        ],
        isError: true
      };
    }
  } else {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
  }
});

// Run the server
const run = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pollinations MCP server running on stdio');
};

run().catch(console.error);