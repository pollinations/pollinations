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
- **Publishable keys (pk_)**: Client-safe, rate-limited (1 pollen/hour per IP+key)
- **Secret keys (sk_)**: Server-side only, no rate limits, can spend Pollen

Get your API key at: https://enter.pollinations.ai

## Available Tools

### Image & Video Generation
- **generateImageUrl** - Get a shareable URL for an image (without API key)
- **generateImage** - Generate an image and get base64 data
- **generateImageBatch** - Generate multiple images in parallel (best with sk_ keys)
- **generateVideo** - Generate videos using veo, seedance, or seedance-pro
- **generateVideoUrl** - Get a shareable URL for a video (without API key)
- **describeImage** - Analyze/describe an image using vision AI
- **analyzeVideo** - Analyze YouTube videos or video URLs using gemini-large
- **listImageModels** - List all available image/video models (dynamic)

### Text Generation
- **generateText** - Simple text generation from a prompt
- **chatCompletion** - OpenAI-compatible chat completions with tool calling
- **webSearch** - Search the web using perplexity or gemini-search
- **listTextModels** - List all available text models (dynamic)
- **getPricing** - Get model pricing info (cost per token/image)

### Audio
- **respondAudio** - AI responds to your prompt with speech
- **sayText** - Text-to-speech (verbatim)
- **transcribeAudio** - Transcribe audio using gemini-large
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
- Video generation: veo (4/6/8s, audio), seedance (2-10s, multi-image)
- Web search: Use webSearch with perplexity-fast, perplexity-reasoning, or gemini-search
- Audio transcription: Use transcribeAudio with gemini-large
- Reasoning: Use kimi-k2-thinking, perplexity-reasoning, openai-large, gemini-large`;

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
                // Tool format: [name, description, inputSchema, handler]
                if (!Array.isArray(tool) || tool.length < 4) {
                    throw new Error(`Invalid tool format for ${tool[0] || 'unknown'}`);
                }
                const [name, description, inputSchema, handler] = tool;
                server.tool(name, description, inputSchema, handler);
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

// Start the server
startMcpServer();
