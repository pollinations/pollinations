import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { COUNCIL_MCP_TIER_FEES } from "../../shared/registry/mcp.ts";

// InferencePort's hosted Council of LLMs. It runs the council and bills the
// key's wallet; this Worker forwards the call and bills the caller the same
// amount from the usage InferencePort reports.
const COUNCIL_URL = "https://api.inferenceport.ai/mcp/council/";
// InferencePort stops a run after 600s.
const RUN_TIMEOUT_MS = 610_000;

class CouncilFailure extends Error {
    constructor(status, message, cost = 0) {
        super(message);
        this.status = status;
        this.cost = cost;
    }
}

async function runCouncil(args, env, fetchImpl) {
    if (!env.INFERENCEPORT_API_KEY) {
        throw new CouncilFailure(500, "InferencePort key is not configured");
    }
    const client = new Client(
        { name: "pollinations-council-mcp", version: "0.1.0" },
        { capabilities: {} },
    );
    try {
        await client.connect(
            new StreamableHTTPClientTransport(new URL(COUNCIL_URL), {
                fetch: fetchImpl,
                requestInit: {
                    headers: {
                        Authorization: `Bearer ${env.INFERENCEPORT_API_KEY}`,
                    },
                },
            }),
        );
        const result = await client.callTool(
            { name: "council_reason", arguments: args },
            { timeout: RUN_TIMEOUT_MS },
        );
        const text = result.content?.[0]?.text;
        if (result.isError) {
            throw new CouncilFailure(
                502,
                text || "InferencePort council failed",
            );
        }
        const run = JSON.parse(text);
        // InferencePort reports the credits its model calls charged; the
        // surcharge counts only when InferencePort actually charged it.
        const { model_credits, surcharge_credits, charged } = run.billing;
        if (!Number.isFinite(model_credits) || model_credits < 0) {
            throw new CouncilFailure(
                502,
                "InferencePort council response is missing usage cost",
            );
        }
        return {
            cost: model_credits + (charged ? surcharge_credits : 0),
            text: `${run.answer}\n\n(${run.council.tier_name}: ${run.council.models_used} models answered)`,
        };
    } catch (error) {
        console.error(`council failed: ${error.name}: ${error.message}`);
        throw error instanceof CouncilFailure
            ? error
            : new CouncilFailure(502, "Council request failed");
    } finally {
        await client.close().catch(() => {});
    }
}

function buildServer(env, fetchImpl, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-council-mcp", version: "0.1.0" },
        {
            instructions:
                "Use council_reason for hard reasoning problems that benefit from several models checking each other.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "council_reason",
        {
            description:
                "Send a problem to InferencePort's council of LLMs: models answer in parallel, review each other, and judge models synthesize one answer. Higher tiers use more and stronger models and cost more.",
            inputSchema: z.object({
                problem: z.string().min(1).max(20000),
                tier: z.enum(Object.keys(COUNCIL_MCP_TIER_FEES)).optional(),
                iteration_rounds: z.number().int().min(1).max(3).optional(),
            }),
        },
        async ({ problem, tier = "basic", iteration_rounds = 1 }) => {
            const receipt = {
                tool: "council_reason",
                adjustmentId: `inferenceport.council.${tier}.v1`,
                adjustmentUnits: 1,
            };
            try {
                const { cost, text } = await runCouncil(
                    { problem, tier, iteration_rounds },
                    env,
                    fetchImpl,
                );
                reportUsage({ ...receipt, cost, status: 200 });
                return { content: [{ type: "text", text }] };
            } catch (failure) {
                reportUsage({
                    ...receipt,
                    cost: failure.cost,
                    // No run fee was charged.
                    adjustmentUnits: 0,
                    status: failure.status,
                    error: failure.message,
                });
                throw failure;
            }
        },
    );
    return server;
}

export function createWorker({ fetchImpl }) {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
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

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer(env, fetchImpl, (reportedUsage) => {
                        usage = reportedUsage;
                    }),
                { onerror: (error) => console.error(error) },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
