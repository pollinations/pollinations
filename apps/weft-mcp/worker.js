import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { WEFT_MCP_MAX_COST_USD } from "../../shared/registry/mcp.ts";

class WeftFailure extends Error {
    constructor(status, message, cost = 0) {
        super(message);
        this.status = status;
        this.cost = cost;
    }
}

function paymentCost(body) {
    const paid = Number(body?.paid_usd ?? 0);
    const held = Number(body?.held_usd ?? 0);
    if (
        !Number.isFinite(paid) ||
        !Number.isFinite(held) ||
        paid < 0 ||
        held < 0
    ) {
        throw new WeftFailure(502, "Weft returned invalid payment amounts");
    }
    if (body?.payment_status === undefined && body?.held_usd != null) {
        throw new WeftFailure(502, "Weft returned no payment status", held);
    }
    // Prototype: pending holds are charged provisionally. Reconcile reversals
    // before this worker is deployed with a real buyer key.
    return ["pending", "declined-pending"].includes(body?.payment_status)
        ? Math.max(paid, held)
        : paid;
}

async function callWeft(path, payload, env, fetchImpl, idempotencyKey) {
    if (!env.WEFT_BUYER_API_KEY) {
        throw new WeftFailure(503, "Weft buyer key is not configured");
    }
    if (!env.WEFT_API_URL) {
        throw new WeftFailure(503, "Weft API URL is not configured");
    }
    const response = await fetchImpl(`${env.WEFT_API_URL}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.WEFT_BUYER_API_KEY}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new WeftFailure(
            response.status >= 500 ? 502 : response.status,
            body?.message ||
                body?.error?.message ||
                `Weft returned HTTP ${response.status}`,
            paymentCost(body),
        );
    }
    if (!body || typeof body !== "object") {
        throw new WeftFailure(502, "Weft returned an invalid response");
    }
    return body;
}

function textResult(text) {
    return { content: [{ type: "text", text }] };
}

function reportFailure(reportUsage, tool, error) {
    const failure =
        error instanceof WeftFailure
            ? error
            : new WeftFailure(502, "Weft request failed");
    reportUsage({
        cost: failure.cost,
        tool,
        status: failure.status,
        adjustmentId: "weft.fetch.v1",
        adjustmentUnits: 0,
        error: failure.message,
    });
    throw failure;
}

function formatFetch(body) {
    if (typeof body.body_base64 !== "string") {
        return textResult(
            `Weft returned no content. Payment status: ${body.payment_status}`,
        );
    }
    const contentType =
        body.headers?.["content-type"] || body.headers?.["Content-Type"] || "";
    const metadata = `HTTP ${body.status}; payment ${body.payment_status}; cost ${body.paid_usd} USD; held ${body.held_usd ?? "0"} USD`;
    if (!/^(text\/|application\/(json|[^;]+\+json))/.test(contentType)) {
        return textResult(
            `${metadata}\nContent-Type: ${contentType || "unknown"}\nBase64: ${body.body_base64}`,
        );
    }
    try {
        const bytes = Uint8Array.from(atob(body.body_base64), (char) =>
            char.charCodeAt(0),
        );
        return textResult(`${metadata}\n\n${new TextDecoder().decode(bytes)}`);
    } catch {
        return textResult(`${metadata}\nBase64: ${body.body_base64}`);
    }
}

function buildServer(env, fetchImpl, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-weft-mcp", version: "0.1.0" },
        {
            instructions:
                "Search Weft for compatible GET APIs, then fetch one with a merchant-price cap.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "weft_search",
        {
            description:
                "Find Weft APIs that support read-only paid fetches. Search is free.",
            inputSchema: z.object({
                query: z.string().min(1),
                maxResults: z.number().int().min(1).max(10).optional(),
            }),
        },
        async ({ query, maxResults }) => {
            try {
                const body = await callWeft(
                    "/search",
                    {
                        query,
                        max_results: maxResults ?? 5,
                        filters: {
                            method: { eq: "GET" },
                            weft_fetch_compatible: true,
                        },
                    },
                    env,
                    fetchImpl,
                );
                return textResult(JSON.stringify(body));
            } catch (error) {
                return reportFailure(reportUsage, "weft_search", error);
            }
        },
    );

    server.registerTool(
        "weft_fetch",
        {
            description:
                "Fetch a public HTTPS URL through Weft. maxCostUsd caps merchant price, not network fees. Uses Paid Pollen; maximum merchant price $0.05.",
            inputSchema: z.object({
                url: z.url().startsWith("https://"),
                maxCostUsd: z.number().positive().max(WEFT_MCP_MAX_COST_USD),
            }),
        },
        async ({ url, maxCostUsd }) => {
            try {
                const body = await callWeft(
                    "/fetch",
                    {
                        url,
                        max_cost_usd: String(maxCostUsd),
                        method: "GET",
                        allow_tempo_refill: false,
                    },
                    env,
                    fetchImpl,
                    crypto.randomUUID(),
                );
                if (typeof body.paid_usd !== "string") {
                    throw new WeftFailure(
                        502,
                        "Weft fetch response is missing payment amount",
                    );
                }
                const cost = paymentCost(body);
                if (cost > maxCostUsd) {
                    throw new WeftFailure(
                        502,
                        "Weft exceeded the merchant-price cap",
                        cost,
                    );
                }
                const result = formatFetch(body);
                reportUsage({
                    cost,
                    tool: "weft_fetch",
                    status:
                        Number.isInteger(body.status) &&
                        body.status >= 100 &&
                        body.status <= 599
                            ? body.status
                            : 502,
                    adjustmentId: "weft.fetch.v1",
                    adjustmentUnits: 1,
                });
                return result;
            } catch (error) {
                return reportFailure(reportUsage, "weft_fetch", error);
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
                    buildServer(env, fetchImpl, (receipt) => {
                        usage = receipt;
                    }),
                { onerror: (error) => console.error(error) },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
