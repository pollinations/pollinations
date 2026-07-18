#!/usr/bin/env node

/**
 * pollinations.ai MCP Server
 *
 * A Model Context Protocol server for pollinations.ai services.
 * Supports image, video, text, and audio generation via gen.pollinations.ai
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
// Import tools from services
import { imageTools } from "./services/imageService.js";
import { textTools } from "./services/textService.js";

// Combine all tools
const allTools = [...imageTools, ...textTools, ...audioTools, ...accountTools];

/**
 * Server instructions shown to MCP clients
 */
const SERVER_INSTRUCTIONS = `# Pollinations MCP Server

All requests go through https://gen.pollinations.ai.

Authentication is configured only with the POLLINATIONS_API_KEY environment variable. Never pass an API key in tool arguments or conversation content.

Use chatCompletion for text generation, including model capabilities such as reasoning, tools, and web search. Use listTextModels, listImageModels, and listAudioVoices to inspect the live registries. Gen validates models, aliases, modalities, and request parameters.`;

/**
 * Start the MCP server with STDIO transport
 */
async function startMcpServer() {
    try {
        // Create the MCP server
        const server = new McpServer(
            {
                name: "pollinations-mcp",
                version: "2.3.0",
                instructions: SERVER_INSTRUCTIONS,
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        // Register all tools
        for (const [name, description, inputSchema, handler] of allTools) {
            server.tool(name, description, inputSchema, handler);
        }

        // Error handling
        server.onerror = (error) => {
            console.error(`Server error: ${error.message}`);
        };

        // Windows does not deliver SIGTERM when the MCP client exits.
        // stdin `close` fires whenever the parent's end of the pipe goes
        // away (graceful EOF or abrupt fd close), so it's the reliable
        // one-stop signal that the client is gone.
        process.stdin.on("close", () => process.exit(0));

        // Create and connect STDIO transport
        const transport = new StdioServerTransport();
        await server.connect(transport);

        console.error("Pollinations MCP Server running on stdio");
        console.error("API: https://gen.pollinations.ai");
    } catch (error) {
        console.error(`Failed to start MCP server: ${error.message}`);
        process.exit(1);
    }
}

await startMcpServer();
