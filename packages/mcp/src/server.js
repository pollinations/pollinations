import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
import { authTools } from "./services/authService.js";
import { imageTools } from "./services/imageService.js";
import { textTools } from "./services/textService.js";
import { validateApiBaseUrl } from "./utils/coreUtils.js";

const serviceTools = [
    ...imageTools,
    ...textTools,
    ...audioTools,
    ...accountTools,
];

export { createMcpHandler };

function createServerInstructions(apiBaseUrl, includeAuthTools, version) {
    const authentication = includeAuthTools
        ? `Set your API key first using the setApiKey tool:
- **Publishable keys (pk_)**: Client-safe and rate-limited
- **Secret keys (sk_)**: Server-side only and can spend Pollen`
        : `Send a Pollinations secret API key with every MCP request:

\`Authorization: Bearer sk_...\`

The credential is forwarded to the Pollinations API for that request only.`;

    const authenticationTools = includeAuthTools
        ? `
### Authentication
- **setApiKey** - Set your API key
- **getKeyInfo** - Check current key status (local)
- **clearApiKey** - Remove stored key
`
        : "";

    return `# Pollinations MCP Server v${version}

## Authentication
${authentication}

Get your API key at: https://enter.pollinations.ai/keys

## Available Tools

### Image & Video Generation
- **generateImage** - Generate an image as an MCP image or resource link
- **generateVideo** - Generate a video as an embedded resource
- **listImageModels** - List available image and video models

### Text Generation
- **chatCompletion** - OpenAI-compatible text, search, multimodal, and tool-calling API
- **listTextModels** - List available text models

### Audio
- **generateAudio** - Generate speech, music, or sound as MCP audio
${authenticationTools}
### Account
- **getBalance** - Get the authenticated key's Pollen balance

## API Endpoint
All requests go through: ${apiBaseUrl}

Model listing results include the current capabilities, voices, and pricing.`;
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
            instructions: createServerInstructions(
                apiBaseUrl,
                includeAuthTools,
                version,
            ),
        },
        {
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
