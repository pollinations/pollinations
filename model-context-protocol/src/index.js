/**
 * Pollinations MCP Server v2.0
 *
 * A Model Context Protocol server for Pollinations AI services.
 * Supports image, video, text, and audio generation via gen.pollinations.ai
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import player from "play-sound";

// Import tools from services
import { imageTools } from "./services/imageService.js";
import { textTools } from "./services/textService.js";
import { audioTools } from "./services/audioService.js";
import { authTools } from "./services/authService.js";

// Combine all tools
const allTools = [
    ...imageTools,
    ...textTools,
    ...audioTools,
    ...authTools,
];

/**
 * Server instructions shown to MCP clients
 */
const SERVER_INSTRUCTIONS = `# Pollinations MCP Server v2.0

## Authentication
Set your API key first using the setApiKey tool:
- **Publishable keys (pk_)**: Client-safe, rate-limited (3 req/burst, 1/15sec refill)
- **Secret keys (sk_)**: Server-side only, no rate limits, can spend Pollen

Get your API key at: https://pollinations.ai

## Available Tools

### Image & Video Generation
- **generateImageUrl** - Get a URL for an image from a text prompt
- **generateImage** - Generate an image and get base64 data
- **generateVideo** - Generate videos using veo, seedance, or seedance-pro
- **listImageModels** - List all available image/video models (dynamic)

### Text Generation
- **generateText** - Simple text generation from a prompt
- **chatCompletion** - OpenAI-compatible chat completions with tool calling
- **listTextModels** - List all available text models (dynamic)

### Audio Generation
- **respondAudio** - AI responds to your prompt with speech
- **sayText** - Text-to-speech (verbatim)
- **listAudioVoices** - List available voices (dynamic)

### Authentication
- **setApiKey** - Set your API key
- **getKeyInfo** - Check current key status
- **clearApiKey** - Remove stored key

## API Endpoint
All requests go through: https://gen.pollinations.ai

## Tips
- Models are fetched dynamically from the API - always up to date!
- Use listImageModels/listTextModels to see available options
- Image-to-image: Use the 'image' parameter with kontext or seedream models
- Video generation: veo (text-to-video, 4/6/8s, audio), seedance (text/image-to-video, 2-10s)
- Audio output: Use chatCompletion with model='openai-audio' and modalities=['text','audio']
- Reasoning: Use kimi-k2-thinking, perplexity-reasoning, openai-large, gemini-large with reasoning_effort param`;

/**
 * Start the MCP server with STDIO transport
 */
export async function startMcpServer() {
    try {
        // Initialize audio player (optional, for local playback)
        try {
            global.audioPlayer = player();
        } catch (error) {
            console.error("Audio player not available:", error.message);
        }

        // Create the MCP server
        const server = new McpServer(
            {
                name: "pollinations-mcp",
                version: "2.0.0",
                instructions: SERVER_INSTRUCTIONS,
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        // Register all tools
        allTools.forEach((tool) => {
            try {
                server.tool(...tool);
            } catch (error) {
                console.error(`Failed to register tool ${tool[0]}:`, error.message);
            }
        });

        // Error handling
        server.onerror = (error) => {
            console.error(`Server error: ${error.message}`);
        };

        process.on("uncaughtException", (error) => {
            console.error(`Uncaught exception: ${error.message}`);
        });

        process.on("unhandledRejection", (reason) => {
            console.error(`Unhandled rejection: ${reason}`);
        });

        // Create and connect STDIO transport
        const transport = new StdioServerTransport();
        await server.connect(transport);

        console.error("Pollinations MCP Server v2.0.0 running on stdio");
        console.error("API: https://gen.pollinations.ai");

        // Handle graceful shutdown
        process.on("SIGINT", () => process.exit(0));
        process.on("SIGTERM", () => process.exit(0));
    } catch (error) {
        console.error(`Failed to start MCP server: ${error.message}`);
        process.exit(1);
    }
}
