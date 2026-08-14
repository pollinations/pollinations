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
        : `Send a Pollinations API key with every MCP request:

\`Authorization: Bearer YOUR_KEY\`

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
- **generateImageUrl** - Get a shareable URL for an image
- **generateImage** - Generate an image and get base64 data
- **generateImageBatch** - Generate multiple images in parallel
- **generateVideo** - Generate videos
- **generateVideoUrl** - Get a shareable URL for a video
- **describeImage** - Analyze or describe an image
- **analyzeVideo** - Analyze a video URL
- **listImageModels** - List available image and video models

### Text Generation
- **generateText** - Simple text generation from a prompt
- **chatCompletion** - OpenAI-compatible chat completions with tool calling
- **webSearch** - Search the web with a search-capable model
- **listTextModels** - List available text models
- **getPricing** - Get model pricing

### Audio
- **respondAudio** - Generate a spoken response
- **sayText** - Convert text to speech verbatim
- **transcribeAudio** - Transcribe audio
- **listAudioVoices** - List available voices
${authenticationTools}
### Account
- **getBalance** - Get the authenticated key's Pollen balance
- **getUsage** - Get recent usage history
- **listQuests** - List quests and earned rewards

## API Endpoint
All requests go through: ${apiBaseUrl}

Use the model and voice listing tools for the current registry.`;
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
