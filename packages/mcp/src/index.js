#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
import { imageTools } from "./services/imageService.js";
import { textTools } from "./services/textService.js";

const allTools = [...imageTools, ...textTools, ...audioTools, ...accountTools];

const SERVER_INSTRUCTIONS = `# Pollinations MCP Server

All requests go through https://gen.pollinations.ai.

Authentication is configured only with the POLLINATIONS_API_KEY environment variable. Never pass an API key in tool arguments or conversation content.

Use chatCompletion for text and multimodal generation, including reasoning, tool use, web search, and media analysis. Use textToSpeech and transcribeAudio for the dedicated OpenAI-compatible audio endpoints. Use listModels to inspect the live registry. Gen validates models, aliases, modalities, and request parameters.`;

async function startMcpServer() {
    const server = new McpServer({
        name: "pollinations-mcp",
        version: "3.0.0",
        instructions: SERVER_INSTRUCTIONS,
    });

    for (const [name, description, inputSchema, handler] of allTools) {
        server.registerTool(name, { description, inputSchema }, handler);
    }

    process.stdin.on("close", () => process.exit(0));
    await server.connect(new StdioServerTransport());

    console.error("Pollinations MCP Server running on stdio");
}

await startMcpServer();
