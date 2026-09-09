import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
import { discoveryTools } from "./services/discoveryService.js";
import { embeddingTools } from "./services/embeddingService.js";
import { imageTools } from "./services/imageService.js";
import { model3dTools } from "./services/model3dService.js";
import { textTools } from "./services/textService.js";
import { validateApiBaseUrl } from "./utils/coreUtils.js";

const SERVER_VERSION = "2.5.1";

const tools = [
    ...imageTools,
    ...textTools,
    ...audioTools,
    ...embeddingTools,
    ...model3dTools,
    ...discoveryTools,
    ...accountTools,
];

export { createMcpHandler };

const SERVER_INSTRUCTIONS = `# Pollinations MCP Server v${SERVER_VERSION}

## Authentication
Send a Pollinations API key with every MCP request:

\`Authorization: Bearer YOUR_KEY\`

The credential is forwarded to the Pollinations API for that request only.

Get your API key at: https://enter.pollinations.ai/keys

## Model discovery and generation

Pollinations is a live multi-model gateway. Never decide that a requested model is unavailable based on prior knowledge.

- When the user names a model or provider, or asks about availability, capabilities, aliases, voices, or pricing, call listModels with the relevant modality first.
- Match the request against both model names and aliases, then pass the canonical model name to the generation tool.
- generateText can invoke any listed text model or agent. Use listModels with agent=true to discover agents. generateImage can invoke any listed image model.
- transcribeAudio converts spoken audio from a public HTTPS URL into text.
- For pricing, quote the returned pricing fields and currency; do not estimate.
- Use getModelStatus for recent health and latency, not model discovery.

## API Endpoint
All requests go through: ${validateApiBaseUrl()}`;

export function buildServer() {
    const server = new McpServer(
        {
            name: "pollinations-mcp",
            version: SERVER_VERSION,
        },
        {
            instructions: SERVER_INSTRUCTIONS,
            capabilities: {
                tools: {},
            },
        },
    );

    for (const tool of tools) {
        const [name, description, inputSchema, handler] = tool;
        server.registerTool(
            name,
            { description, inputSchema: z.object(inputSchema) },
            handler,
        );
    }

    server.onerror = (error) => {
        console.error(`Server error: ${error.message}`);
    };

    return server;
}
