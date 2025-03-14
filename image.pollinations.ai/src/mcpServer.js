import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { MODELS } from "./models.js";
import { createAndReturnImageCached } from "./createAndReturnImages.js";
import { makeParamsSafe } from "./makeParamsSafe.js";
import debug from 'debug';
import crypto from 'crypto';

const logError = debug('pollinations:mcp:error');
const logApi = debug('pollinations:api');
// Create MCP server instance with detailed metadata
const mcpServer = new McpServer({
  name: "Pollinations Image Generator",
  version: "1.0.0",
  description: "Generate AI images using various models through the Model Context Protocol",
  provider: {
    name: "Pollinations.AI",
    url: "https://pollinations.ai",
    contact: "https://github.com/pollinations/pollinations/issues"
  },
  documentation: {
    url: "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md#mcp-interface"
  },
  capabilities: {
    resources: ["models", "capabilities"],
    tools: ["generate-image"],
    prompts: ["create-image"]
  }
});

// Expose available models as a resource
mcpServer.resource(
  "models",
  "models://list",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify(Object.entries(MODELS).map(([name, config]) => ({
        name,
        type: config.type,
        capabilities: {
          enhance: config.enhance,
          maxSideLength: config.maxSideLength
        }
      })))
    }]
  })
);

// Expose model capabilities as a resource
mcpServer.resource(
  "capabilities",
  new ResourceTemplate("capabilities://{model}", { list: undefined }),
  async (uri, { model }) => {
    const modelConfig = MODELS[model];
    if (!modelConfig) {
      throw new Error('Model not found');
    }
    
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          type: modelConfig.type,
          enhance: modelConfig.enhance,
          maxSideLength: modelConfig.maxSideLength,
          supportedFeatures: {
            seed: true,
            width: true,
            height: true,
            nologo: true,
            private: true,
            enhance: modelConfig.enhance,
            safe: true
          }
        })
      }]
    };
  }
);

// Expose image generation as a tool
mcpServer.tool(
  "generate-image",
  {
    prompt: z.string().min(1).describe("Text description of the image to generate"),
    model: z.string().optional().describe("Model to use for generation (see models://list)"),
    seed: z.number().int().optional().describe("Random seed for reproducibility"),
    width: z.number().int().optional().describe("Output image width"),
    height: z.number().int().optional().describe("Output image height"),
    nologo: z.boolean().optional().describe("Disable logo watermark"),
    private: z.boolean().optional().describe("Keep image private"),
    enhance: z.boolean().optional().describe("Enable image enhancement if supported by model"),
    safe: z.boolean().optional().describe("Enable safety filters"),
    format: z.enum(['jpeg', 'png']).optional().default('jpeg').describe("Output image format")
  },
  async (params) => {
    const startTime = Date.now();
    
    try {
      // Validate model if specified
      if (params.model && !MODELS[params.model]) {
        throw new Error('Invalid model');
      }

      // Apply safe parameters
      const safeParams = makeParamsSafe(params);
      
      // Generate image
      logApi('Generating image with params:', safeParams);
      const { buffer, ...maturity } = await createAndReturnImageCached(params.prompt, safeParams);
      
      // Convert buffer to base64
      const base64Image = buffer.toString('base64');
      const mimeType = params.format === 'png' ? 'image/png' : 'image/jpeg';
      
      const endTime = Date.now();
      
      return {
        content: [
          {
            type: "image",
            data: `data:${mimeType};base64,${base64Image}`
          },
          {
            type: "text",
            text: JSON.stringify({
              ...maturity,
              metadata: {
                model: params.model || 'flux',
                inference_time_ms: endTime - startTime,
                parameters: safeParams
              }
            })
          }
        ]
      };
    } catch (error) {
      logError('Image generation failed:', error);
      throw error;
    }
  }
);

// Add prompt templates for common use cases
mcpServer.prompt(
  "create-image",
  {
    description: z.string().describe("Main description of what to generate"),
    style: z.string().optional().describe("Visual style to apply"),
    mood: z.string().optional().describe("Emotional mood or atmosphere"),
    details: z.string().optional().describe("Additional details or specifications")
  },
  ({ description, style, mood, details }) => {
    let prompt = description;
    if (style) prompt += `, in the style of ${style}`;
    if (mood) prompt += `, with a ${mood} mood`;
    if (details) prompt += `. Additional details: ${details}`;
    
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: prompt
        }
      }]
    };
  }
);

// Minimal dummy implementation of MCP server endpoints
export const handleMcpSSE = (req, res) => {
  console.log(`MCP SSE connection received - URL: ${req.url}`);
  
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Generate a session ID for the client to use
  const sessionId = crypto.randomUUID();
  
  // Send the endpoint event with the message endpoint URL
  res.write(`event: endpoint\n`);
  res.write(`data: /mcp/messages?sessionId=${sessionId}\n\n`);
  
  // Send a dummy event to keep the connection alive
  res.write(`event: message\n`);
  res.write(`data: {"jsonrpc":"2.0","method":"notification","params":{"type":"status","status":"connected"}}\n\n`);
  
  // Handle connection close
  req.on('close', () => {
    console.log('SSE connection closed');
  });
};

// Handle MCP messages
export const handleMcpMessage = (req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const message = JSON.parse(body);
      console.log('Received MCP message:', message);
      
      // Set CORS headers
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      
      // For now, just acknowledge the message
      res.end('Accepted');
      
      // In the future, we can add proper handling for different message types
      // if (message.method === 'tool' && message.params.name === 'generate-image') {
      //   // Handle image generation request
      // }
    } catch (e) {
      console.error('Error parsing MCP message:', e);
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
};
