import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { accountTools } from "./services/accountService.js";
import { audioTools } from "./services/audioService.js";
import { imageTools } from "./services/imageService.js";
import { textTools } from "./services/textService.js";
import { validateApiBaseUrl } from "./utils/coreUtils.js";

const tools = [...imageTools, ...textTools, ...audioTools, ...accountTools];

export { createMcpHandler };

function instructions(apiBaseUrl) {
    return `# Pollinations MCP Server

All requests go through ${apiBaseUrl}.

For hosted HTTP, send a Pollinations API key as an Authorization bearer token. For local stdio, set POLLINATIONS_API_KEY before starting the server. Never put API keys in tool arguments or conversation content.

Use chatCompletion for text, multimodal input, tools, reasoning, and model-provided web search. Use listModels for the raw live registry. Gen owns model aliases, defaults, validation, pricing, and errors.`;
}

export function buildServer({
    apiBaseUrl = validateApiBaseUrl(),
    version = "3.0.0",
} = {}) {
    const server = new McpServer(
        { name: "pollinations-mcp", version },
        {
            instructions: instructions(apiBaseUrl),
            capabilities: { tools: {} },
        },
    );

    for (const [name, description, inputSchema, handler] of tools) {
        server.registerTool(name, { description, inputSchema }, handler);
    }

    server.onerror = (error) => {
        console.error(`Server error: ${error.message}`);
    };
    return server;
}
