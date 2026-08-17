import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
import { authTools } from "./services/authService.js";
import { discoveryTools } from "./services/discoveryService.js";
import { embeddingTools } from "./services/embeddingService.js";
import { imageTools } from "./services/imageService.js";
import { mediaTools } from "./services/mediaService.js";
import { model3dTools } from "./services/model3dService.js";
import { textTools } from "./services/textService.js";
import { validateApiBaseUrl } from "./utils/coreUtils.js";

const serviceTools = [
    ...imageTools,
    ...textTools,
    ...audioTools,
    ...embeddingTools,
    ...model3dTools,
    ...mediaTools,
    ...discoveryTools,
    ...accountTools,
];

export { createMcpHandler };

function createServerInstructions(apiBaseUrl, includeAuthTools, version) {
    const authentication = includeAuthTools
        ? `Set your API key first using the setApiKey tool:
- **Publishable keys (pk_)**: Client-safe and rate-limited
- **Secret keys (sk_)**: Server-side only and can spend Pollen`
        : `Send a Pollinations API key with every MCP request:

\`Authorization: Bearer YOUR_KEY\`

The credential is forwarded to the Pollinations API for that request only.`;

    return `# Pollinations MCP Server v${version}

## Authentication
${authentication}

Get your API key at: https://enter.pollinations.ai/keys

## Model discovery and generation

Pollinations is a live multi-model gateway. Never decide that a requested model is unavailable based on prior knowledge.

- When the user names a model or provider, or asks about availability, capabilities, aliases, voices, or pricing, call listModels with the relevant modality first.
- Match the request against both model names and aliases, then pass the canonical model name to the generation tool.
- generateText can invoke any listed text model; generateImage can invoke any listed image model.
- transformMedia trims or resizes video, extracts audio, or captures a frame from a public media URL.
- For pricing, quote the returned pricing fields and currency; do not estimate.
- Use getModelStatus for recent health and latency, not model discovery.

## API Endpoint
All requests go through: ${apiBaseUrl}`;
}

export function buildServer({
    apiBaseUrl = validateApiBaseUrl(),
    includeAuthTools = true,
    version = "2.4.0",
} = {}) {
    const server = new McpServer(
        {
            name: "pollinations-mcp",
            version,
        },
        {
            instructions: createServerInstructions(
                apiBaseUrl,
                includeAuthTools,
                version,
            ),
            capabilities: {
                tools: {},
            },
        },
    );

    const tools = includeAuthTools
        ? [...serviceTools, ...authTools]
        : serviceTools;

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
