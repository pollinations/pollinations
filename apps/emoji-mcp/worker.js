import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";
import { EMOJIS } from "./emoji-data.js";

function buildServer() {
    const server = new McpServer(
        { name: "emoji-mcp", title: "Emoji MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "search_emoji",
        {
            description:
                "Search emoji by keyword (for example: pizza, laugh, heart, money, rocket, robot). " +
                "Returns matching emoji characters with their names. Exact and partial name matches " +
                "win over keyword matches, and matches are ranked by relevance.",
            inputSchema: z.object({
                keyword: z.string().min(1).describe("Keyword to search for"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("Maximum number of results (default 10)"),
            }),
        },
        async ({ keyword, limit }) => {
            const maxResults = Math.min(Math.max(limit ?? 10, 1), 50);
            const q = keyword.toLowerCase().trim();
            if (!q) {
                return createMCPResponse([
                    createTextContent(
                        { error: "keyword must not be empty" },
                        true,
                    ),
                ]);
            }
            const scored = [];
            for (const [name, char, keywords] of EMOJIS) {
                const nameLower = name.toLowerCase();
                const kw = keywords.toLowerCase();
                let score = -1;
                if (nameLower === q) score = 100;
                else if (nameLower.startsWith(q)) score = 90;
                else if (nameLower.includes(q)) score = 60;
                else if (kw === q) score = 85;
                else if (kw.includes(q)) score = 50;
                if (score >= 0) {
                    scored.push({ char, name, score });
                }
            }
            scored.sort((a, b) => b.score - a.score);
            const top = scored
                .slice(0, maxResults)
                .map(({ char, name }) => ({ emoji: char, name }));
            return createMCPResponse([
                createTextContent(
                    { query: keyword, count: top.length, results: top },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "emoji_name",
        {
            description:
                "Look up the official name (and a short description) of a single emoji character.",
            inputSchema: z.object({
                emoji: z
                    .string()
                    .min(1)
                    .describe("The emoji character to look up"),
            }),
        },
        async ({ emoji }) => {
            const target = emoji.trim();
            const found = EMOJIS.find(([, char]) => char === target);
            if (!found) {
                return createMCPResponse([
                    createTextContent({ emoji: target, found: false }, true),
                ]);
            }
            const [name, char, keywords] = found;
            return createMCPResponse([
                createTextContent(
                    {
                        emoji: char,
                        name,
                        keywords: keywords.split(","),
                        found: true,
                    },
                    true,
                ),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "emoji-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        return mcpHandler.fetch(request);
    },
};
