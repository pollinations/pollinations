import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
    type McpUsageReceipt,
    withMcpUsageHeaders,
} from "@shared/mcp-usage.ts";
import { createGateway, generateText } from "ai";
import { z } from "zod";

const costSchema = z
    .union([z.number(), z.string().trim().min(1)])
    .transform(Number)
    .pipe(z.number().finite().nonnegative());

export async function handleTakoMcp(
    request: Request,
    apiKey?: string,
): Promise<Response> {
    let receipt: McpUsageReceipt | undefined;
    const handler = createMcpHandler(() => {
        const server = new McpServer(
            { name: "pollinations-tako", version: "0.1.0" },
            {
                capabilities: { tools: {} },
            },
        );
        server.registerTool(
            "tako_search",
            {
                description:
                    "Search the web and structured data; return results with sources.",
                inputSchema: z.object({
                    query: z.string().trim().min(1).max(2000),
                    effort: z.enum(["instant", "fast", "deep"]).default("fast"),
                }),
            },
            async ({ query, effort }) => {
                receipt = {
                    cost: 0,
                    tool: "tako_search",
                    status: 502,
                    adjustmentId: "vercel.tako.request.v1",
                    adjustmentUnits: 1,
                };
                try {
                    if (!apiKey)
                        throw new Error("AI Gateway is not configured");
                    const gateway = createGateway({ apiKey });
                    const result = await generateText({
                        model: gateway("openai/gpt-5.4-nano"),
                        system: "Call tako_search once with the exact query and effort supplied by the user. Do not answer or change the query. Do not request inline contents.",
                        prompt: JSON.stringify({ query, effort }),
                        tools: {
                            tako_search: gateway.tools.takoSearch({
                                effort,
                                sources: {
                                    data: { includeContents: false },
                                    web: { includeContents: false },
                                },
                            }),
                        },
                        toolChoice: { type: "tool", toolName: "tako_search" },
                        providerOptions: { gateway: { sort: "cost" } },
                        maxOutputTokens: 1024,
                        maxRetries: 0,
                    });
                    // Gateway's receipt covers the full request, including model and tool charges.
                    receipt.cost = costSchema.parse(
                        result.finalStep.providerMetadata?.gateway?.cost,
                    );
                    const searches = result.toolResults.filter(
                        ({ toolName }) => toolName === "tako_search",
                    );
                    if (searches.length !== 1)
                        throw new Error(
                            "Gateway did not return one Tako result",
                        );
                    const output = z
                        .object({ request_id: z.string() })
                        .passthrough()
                        .parse(searches[0].output);
                    if ("error" in output)
                        throw new Error("Tako search failed");
                    receipt.status = 200;
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: JSON.stringify(output),
                            },
                        ],
                        structuredContent: output,
                    };
                } catch {
                    receipt.error =
                        "Tako search failed or returned invalid usage";
                    return {
                        isError: true,
                        content: [
                            { type: "text" as const, text: receipt.error },
                        ],
                    };
                }
            },
        );
        return server;
    });
    const response = await handler.fetch(request);
    // Drain the stateless response before collecting its tool receipt.
    return withMcpUsageHeaders(
        new Response(await response.arrayBuffer(), response),
        receipt,
    );
}
