import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { COUNCIL_MCP_TIER_FEES } from "../../shared/registry/mcp.ts";
import { TIERS } from "./tiers.js";

const CHAT_URL = "https://api.inferenceport.ai/v1/chat/completions";

class CouncilFailure extends Error {
    constructor(status, message, cost = 0) {
        super(message);
        this.status = status;
        this.cost = cost;
    }
}

// One chat call. InferencePort reports the credits it charged for the call in
// usage.payg_credits_charged; that is the amount we bill, never an estimate.
async function chat(model, prompt, maxTokens, env, fetchImpl) {
    const response = await fetchImpl(CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.INFERENCEPORT_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
            stream: false,
        }),
    });
    const body = await response.json().catch(() => null);
    const cost = body?.usage?.payg_credits_charged;
    const text = body?.choices?.[0]?.message?.content;
    if (!response.ok || !text || !Number.isFinite(cost) || cost < 0) {
        throw new Error(`${model} returned no usable answer`);
    }
    return { model, text, cost };
}

async function runCouncil({ problem, tier }, env, fetchImpl) {
    if (!env.INFERENCEPORT_API_KEY) {
        throw new CouncilFailure(500, "InferencePort key is not configured");
    }
    const { members, judge, maxTokens } = TIERS[tier];
    const settled = await Promise.allSettled(
        members.map((model) =>
            chat(
                model,
                `You are one member of a council of LLMs. Give your best answer to the problem.\n\nPROBLEM:\n${problem}`,
                maxTokens,
                env,
                fetchImpl,
            ),
        ),
    );
    const answers = settled
        .filter(({ status }) => status === "fulfilled")
        .map(({ value }) => value);
    let cost = answers.reduce((sum, { cost: c }) => sum + c, 0);
    if (answers.length === 0) {
        throw new CouncilFailure(502, "Every council member failed");
    }

    const judged = await chat(
        judge,
        [
            "You are the judge of a council of LLMs. Compare the members' answers, find agreements and mistakes, and write one final answer.",
            `PROBLEM:\n${problem}`,
            ...answers.map(({ model, text }) => `--- ${model} ---\n${text}`),
        ].join("\n\n"),
        maxTokens,
        env,
        fetchImpl,
    ).catch(() => {
        throw new CouncilFailure(502, "The council judge failed", cost);
    });
    cost += judged.cost;

    // The run fee applies only to a run that produced a final answer.
    cost += COUNCIL_MCP_TIER_FEES[tier];
    return {
        cost,
        text: `${judged.text}\n\n(${tier} council: ${answers.length}/${members.length} members answered)`,
    };
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
                "Send a problem to a council of LLMs in parallel and get one answer synthesized by a judge model. Higher tiers use more and stronger models and cost more.",
            inputSchema: z.object({
                problem: z.string().min(1).max(20000),
                tier: z.enum(Object.keys(TIERS)).optional(),
            }),
        },
        async ({ problem, tier = "basic" }) => {
            const receipt = {
                tool: "council_reason",
                adjustmentId: `inferenceport.council.${tier}.v1`,
                adjustmentUnits: 1,
            };
            try {
                const { cost, text } = await runCouncil(
                    { problem, tier },
                    env,
                    fetchImpl,
                );
                reportUsage({ ...receipt, cost, status: 200 });
                return { content: [{ type: "text", text }] };
            } catch (error) {
                const failure =
                    error instanceof CouncilFailure
                        ? error
                        : new CouncilFailure(502, "Council request failed");
                reportUsage({
                    ...receipt,
                    cost: failure.cost,
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
