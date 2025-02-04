import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { MODELS } from "../src/models.js";
import { createAndReturnImageCached } from "../src/createAndReturnImages.js";
import { makeParamsSafe } from "../src/makeParamsSafe.js";

const server = new McpServer({
  name: "Pollinations Image Generator",
  version: "1.0.0"
});

// Expose available models as a resource
server.resource(
  "models",
  "models://list",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify(Object.entries(MODELS).map(([name, config]) => ({
        name,
        ...config
      })))
    }]
  })
);

// Expose image generation as a tool
server.tool(
  "generate-image",
  {
    prompt: z.string(),
    model: z.string().optional(),
    seed: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    nologo: z.boolean().optional(),
    private: z.boolean().optional(),
    enhance: z.boolean().optional(),
    safe: z.boolean().optional()
  },
  async (params) => {
    const safeParams = makeParamsSafe(params);
    const { buffer, ...maturity } = await createAndReturnImageCached(params.prompt, safeParams);
    
    // Convert buffer to base64
    const base64Image = buffer.toString('base64');
    
    return {
      content: [
        {
          type: "image",
          data: `data:image/jpeg;base64,${base64Image}`
        },
        {
          type: "text",
          text: JSON.stringify(maturity)
        }
      ]
    };
  }
);

// Add a prompt template for image generation
server.prompt(
  "create-image",
  {
    description: z.string(),
    style: z.string().optional()
  },
  ({ description, style }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create an image of: ${description}${style ? `\nStyle: ${style}` : ''}`
      }
    }]
  })
);

// Start the server
const app = express();

app.get("/mcp/sse", async (req, res) => {
  const transport = new SSEServerTransport("/mcp/messages", res);
  await server.connect(transport);
});

app.post("/mcp/messages", express.json(), async (req, res) => {
  const transport = new SSEServerTransport("/mcp/messages", res);
  await transport.handlePostMessage(req, res);
});

export const startMcpServer = (port = 16385) => {
  app.listen(port, () => {
    console.log(`MCP server listening on port ${port}`);
  });
};
