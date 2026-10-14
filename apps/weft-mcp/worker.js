import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { WeftClient, WeftError } from "@weftlabs/sdk";
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
    const paid = Number(body.paidUsd ?? 0);
    const held = Number(body.heldUsd ?? 0);
    if (
        !Number.isFinite(paid) ||
        !Number.isFinite(held) ||
        paid < 0 ||
        held < 0
    ) {
        throw new WeftFailure(502, "Weft returned invalid payment amounts");
    }
    if (body.paymentStatus === undefined && body.heldUsd != null) {
        throw new WeftFailure(502, "Weft returned no payment status", held);
    }
    // Prototype: pending holds are charged provisionally. Reconcile reversals
    // before this worker is deployed with a real buyer key.
    return ["pending", "declined-pending"].includes(body.paymentStatus)
        ? Math.max(paid, held)
        : paid;
}

function weftClient(env, fetchImpl) {
    if (!env.WEFT_BUYER_API_KEY) {
        throw new WeftFailure(503, "Weft buyer key is not configured");
    }
    if (!env.WEFT_BASE_URL) {
        throw new WeftFailure(503, "Weft base URL is not configured");
    }
    return new WeftClient({
        apiKey: env.WEFT_BUYER_API_KEY,
        baseUrl: env.WEFT_BASE_URL,
        fetchApi: fetchImpl,
    });
}

function textResult(text) {
    return { content: [{ type: "text", text }] };
}

function reportFailure(reportUsage, tool, error) {
    const failure =
        error instanceof WeftFailure
            ? error
            : error instanceof WeftError
              ? new WeftFailure(
                    error.status >= 400 && error.status < 500
                        ? error.status
                        : 502,
                    `Weft ${error.code}: ${error.message}`,
                )
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
    if (typeof body.bodyBase64 !== "string") {
        return textResult(
            `Weft returned no content. Payment status: ${body.paymentStatus}`,
        );
    }
    const contentType =
        body.headers?.["content-type"] || body.headers?.["Content-Type"] || "";
    const metadata = `HTTP ${body.status}; payment ${body.paymentStatus}; cost ${body.paidUsd} USD; held ${body.heldUsd ?? "0"} USD`;
    if (!/^(text\/|application\/(json|[^;]+\+json))/.test(contentType)) {
        return textResult(
            `${metadata}\nContent-Type: ${contentType || "unknown"}\nBase64: ${body.bodyBase64}`,
        );
    }
    try {
        const bytes = Uint8Array.from(atob(body.bodyBase64), (char) =>
            char.charCodeAt(0),
        );
        return textResult(`${metadata}\n\n${new TextDecoder().decode(bytes)}`);
    } catch {
        return textResult(`${metadata}\nBase64: ${body.bodyBase64}`);
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
                "Find Weft APIs that support read-only paid fetches within the $0.05 cap. Search is free. Pass the result's queryTraceId to weft_fetch as searchId.",
            inputSchema: z.object({
                query: z.string().min(1),
                maxResults: z.number().int().min(1).max(10).optional(),
            }),
        },
        async ({ query, maxResults }) => {
            try {
                const body = await weftClient(env, fetchImpl).search({
                    query,
                    maxResults: maxResults ?? 5,
                    filters: {
                        method: { eq: "GET" },
                        weftFetchCompatible: true,
                        // List only APIs that weft_fetch's hard cap can buy.
                        price: { lte: String(WEFT_MCP_MAX_COST_USD) },
                    },
                });
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
                "Fetch a public HTTPS URL through Weft. maxCostUsd caps merchant price, not network fees. Uses Paid Pollen; maximum merchant price $0.05. Pass searchId (the queryTraceId from weft_search) when a search found the URL.",
            inputSchema: z.object({
                url: z.url().startsWith("https://"),
                maxCostUsd: z.number().positive().max(WEFT_MCP_MAX_COST_USD),
                // Weft ignores a malformed id rather than failing the purchase.
                searchId: z.string().optional(),
            }),
        },
        async ({ url, maxCostUsd, searchId }) => {
            const idempotencyKey = crypto.randomUUID();
            try {
                const body = await weftClient(env, fetchImpl).fetch(
                    {
                        url,
                        maxCostUsd: String(maxCostUsd),
                        method: "GET",
                        allowTempoRefill: false,
                        searchId,
                    },
                    { idempotencyKey },
                );
                if (typeof body.paidUsd !== "string") {
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
                if (error instanceof WeftError && error.charge === "possible") {
                    // Billed at 0, but Weft may have paid the merchant.
                    console.warn("Weft fetch failed after a possible charge", {
                        code: error.code,
                        idempotencyKey,
                    });
                }
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
