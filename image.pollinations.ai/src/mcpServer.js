import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MODELS } from "./models.js";
import { createAndReturnImageCached } from "./createAndReturnImages.js";
import { makeParamsSafe } from "./makeParamsSafe.js";
import debug from 'debug';

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

/**
 * Handle Server-Sent Events (SSE) connection for MCP
 * @param {import('http').IncomingMessage} req - The request object
 * @param {import('http').ServerResponse} res - The response object
 */
export const handleMcpSSE = (req, res) => {
  logApi('MCP SSE connection established');
  mcpServer.handleSSE(req, res);
};

/**
 * Handle MCP message
 * @param {Object} message - The MCP message object
 * @param {import('http').ServerResponse} res - The response object
 */
export const handleMcpMessage = (message, res) => {
  logApi('MCP message received:', message.type);
  mcpServer.handleMessage(message, res);
};
