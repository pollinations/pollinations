import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";
import { getModels } from "../../packages/mcp/src/utils/models.js";
import { planImageBudget } from "./budget.js";

const mcpHandler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "image-budget-mcp", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        server.registerTool(
            "image_budget",
            {
                description:
                    "Plan a batch of images against a Pollen budget without generating or spending. Compare live fixed per-image prices, total batch cost and affordable image counts. Variable/token/megapixel prices and agents are excluded, never treated as free. The budget is supplied by the caller, not read from their wallet. Use listModels for capabilities and variable-price models.",
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: true,
                },
                inputSchema: z.object({
                    images: z.number().int().min(1).max(1000000),
                    budget: z
                        .number()
                        .min(0)
                        .max(1000000)
                        .refine(
                            (value) => value === Number(value.toFixed(12)),
                            "Use at most 12 decimal places",
                        )
                        .describe(
                            "Spendable budget in Pollen, up to 12 decimal places",
                        ),
                    source: z
                        .enum(["official", "community", "all"])
                        .default("official"),
                    query: z
                        .string()
                        .max(200)
                        .optional()
                        .describe(
                            "Search the live catalog for model names, aliases or publishers",
                        ),
                    questOnly: z
                        .boolean()
                        .default(false)
                        .describe("Exclude Paid Pollen-only models"),
                    limit: z.number().int().min(1).max(50).default(10),
                }),
            },
            async ({ source, query, ...params }, context) => {
                const models = await getModels("image", context, {
                    agent: false,
                    community:
                        source === "all" ? undefined : source === "community",
                    query,
                });
                return createMCPResponse([
                    createTextContent(planImageBudget(models, params), true),
                ]);
            },
        );
        return server;
    },
    { legacy: "stateless", onerror: (error) => console.error(error) },
);

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "image-budget-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
        const authorization = request.headers.get("authorization");
        const match = authorization?.trim().match(/^Bearer\s+(\S+)$/i);
        if (!match) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="image-budget-mcp.pollinations.ai"',
                    },
                },
            );
        }
        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }
        return mcpHandler.fetch(request, {
            authInfo: {
                token: match[1],
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
