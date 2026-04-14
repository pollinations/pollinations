import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchKnowledge, pollyTools } from "./tools.js";

const SERVER_INSTRUCTIONS = `# Polly — Pollinations AI Assistant (MCP)

You are connected to the Polly MCP server, the knowledge brain of Pollinations.AI.
Use these tools to learn about and interact with the Pollinations platform.

## Available Tools

### Knowledge & Discovery
- **pollinations_knowledge** — Get comprehensive platform docs (architecture, API, models, tiers, pricing, auth). Call this FIRST.
- **pollinations_list_models** — List available models with real-time pricing data.
- **pollinations_web_search** — Search the web via Pollinations search models.

### Generation
- **pollinations_generate_text** — Generate text (OpenAI-compatible, all models).
- **pollinations_generate_image** — Generate an image and get its URL.

### Account
- **pollinations_account** — Check profile, balance, tier, usage.
- **pollinations_key_info** — Check current API key details.

## Quick Start
1. Call pollinations_knowledge to understand the platform
2. Call pollinations_list_models to see available models
3. Use pollinations_generate_text or pollinations_generate_image to create content
4. Call pollinations_account to check balance and usage

## Auth
The CLI stores your API key in ~/.pollinations/credentials.json
Set it via: polli auth login --token <key>
Get keys at: https://enter.pollinations.ai`;

export async function startPollyMcp() {
    const server = new McpServer(
        {
            name: "polly-mcp",
            version: "0.1.0",
            instructions: SERVER_INSTRUCTIONS,
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        },
    );

    // Register all Polly tools
    for (const tool of pollyTools) {
        server.tool(tool.name, tool.description, tool.schema, tool.handler);
    }

    // Register knowledge base as a resource
    server.resource(
        "pollinations-docs",
        "pollinations://knowledge",
        {
            description: "Complete Pollinations.AI platform documentation",
            mimeType: "text/markdown",
        },
        async () => ({
            contents: [
                {
                    uri: "pollinations://knowledge",
                    mimeType: "text/markdown",
                    text: await fetchKnowledge(),
                },
            ],
        }),
    );

    // Error handling
    server.onerror = (error) => {
        console.error(`Polly MCP error: ${error.message}`);
    };

    process.on("uncaughtException", (error) => {
        console.error(`Uncaught: ${error.message}`);
    });

    process.on("unhandledRejection", (reason) => {
        console.error(`Unhandled: ${reason}`);
    });

    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Polly MCP Server v0.1.0 running on stdio");
    console.error(`Tools: ${pollyTools.map((t) => t.name).join(", ")}`);

    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
}
