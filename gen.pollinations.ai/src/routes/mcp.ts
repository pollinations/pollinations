import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
    sendToTinybird,
} from "@shared/events.ts";
import {
    type McpUsageReceipt,
    parseMcpUsageHeaders,
} from "@shared/mcp-usage.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    getMcpPricingInfo,
    getMcpServerDefinition,
    MCP_SERVERS,
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
    type McpServerDefinition,
} from "@shared/registry/mcp.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";

function requestForMcp(
    request: Request,
    server: McpServerDefinition,
    userId: string,
): Request {
    const headers = new Headers(request.headers);
    if (server.billing === "usage_receipt") {
        headers.delete("authorization");
    }
    headers.delete("cookie");
    headers.delete(MCP_USER_ID_HEADER);
    if (server.userScoped) headers.set(MCP_USER_ID_HEADER, userId);
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        headers.delete(header);
    }
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = "mcp.internal";
    url.pathname = "/";
    return new Request(url, {
        method: request.method,
        headers,
        body:
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : request.body,
        redirect: "manual",
    });
}

function responseForCaller(response: Response): Response {
    const result = new Response(response.body, response);
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        result.headers.delete(header);
    }
    return result;
}

async function settleUsage(
    c: Context<Env>,
    server: Extract<McpServerDefinition, { billing: "usage_receipt" }>,
    usage: McpUsageReceipt,
    startedAt: Date,
): Promise<void> {
    const user = c.var.auth.requireUser();
    const db = drizzle(c.env.DB);
    let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>> | null =
        null;
    try {
        deduction = await handleBalanceDeduction({
            db: db as unknown as Parameters<
                typeof handleBalanceDeduction
            >[0]["db"],
            isBilledUsage: usage.cost > 0,
            totalPrice: usage.cost,
            userId: user.id,
            apiKeyId: c.var.auth.apiKey?.id,
            apiKeyPollenBalance: c.var.auth.apiKey?.pollenBalance,
            // Tool cost is known only after execution. Reconcile the final
            // receipt directly instead of inventing a maximum-cost preflight.
            apiKeyReservedAmount: 0,
            byopClientKeyId: c.var.auth.apiKey?.byopClientKeyId,
            modelPaidOnly: false,
        });
    } catch (error) {
        c.var.log.error(
            "MCP billing deduction failed after response; continuing tracking: {error}",
            {
                error: error instanceof Error ? error.message : String(error),
            },
        );
    }
    const endedAt = new Date();
    const event: TinybirdEvent = {
        id: crypto.randomUUID(),
        requestId: c.get("requestId"),
        requestPath: `/mcp/${server.id}`,
        startTime: startedAt,
        endTime: endedAt,
        responseTime: endedAt.getTime() - startedAt.getTime(),
        responseStatus: usage.status,
        environment: c.env.ENVIRONMENT,
        eventType: "mcp.call",
        ...requestIdentity(c.var.auth),
        ...(deduction?.payerBucket
            ? payerBucketToMeter(deduction.payerBucket)
            : {}),
        modelRequested: server.id,
        resolvedModelRequested: server.id,
        modelUsed: server.id,
        modelProviderUsed: server.provider,
        fallbackUsed: false,
        isFinal: true,
        isBilledUsage: usage.cost > 0,
        adjustmentCosts: { [usage.adjustmentId]: usage.cost },
        adjustmentUnits: { [usage.adjustmentId]: usage.adjustmentUnits },
        ...priceToEventParams(),
        ...usageToEventParams(),
        totalCost: usage.cost,
        totalPrice: deduction?.billedPrice ?? 0,
        devPrice: usage.cost,
        markupRate: deduction?.markup?.markupRate ?? 0,
        errorResponseCode:
            usage.status >= 400 ? String(usage.status) : undefined,
        errorSource:
            usage.status >= 400 ? `${server.id}.${usage.tool}` : undefined,
        errorMessage: usage.status >= 400 ? usage.error : undefined,
    };
    c.executionCtx.waitUntil(
        sendToTinybird(
            event,
            c.env.TINYBIRD_INGEST_URL,
            c.env.TINYBIRD_INGEST_TOKEN,
            c.var.log,
        ),
    );
    if (deduction?.settlementError) {
        const settlementMessage: Record<string, string> = {
            api_key_reconciliation:
                "API key budget reconciliation failed after committed debit",
            dev_credit: "Dev markup credit failed after committed debit",
            community_reward_credit:
                "Community model reward credit failed after committed debit",
        };
        c.executionCtx.waitUntil(
            sendErrorEventToTinybird(
                {
                    timestamp: endedAt.toISOString(),
                    kind: "server_error",
                    severity: "error",
                    request_id: event.requestId,
                    environment: event.environment,
                    route_path: event.requestPath,
                    method: "POST",
                    status: 200,
                    duration_ms: endedAt.getTime() - startedAt.getTime(),
                    error_class: "SettlementFailure",
                    error_code: `settlement_${deduction.settlementError}`,
                    message:
                        settlementMessage[deduction.settlementError] ??
                        "Settlement failed after committed debit",
                    model_requested: event.modelRequested ?? undefined,
                    resolved_model_requested: event.resolvedModelRequested,
                    user_id: event.userId,
                    user_tier: event.userTier,
                    api_key_id: event.apiKeyId,
                },
                getTinybirdDatasourceIngestUrl(
                    c.env.TINYBIRD_INGEST_URL,
                    "error_event",
                ),
                c.env.TINYBIRD_INGEST_TOKEN,
                c.var.log,
            ),
        );
    }
}

export const mcpRoutes = new Hono<Env>()
    .use("/mcp", edgeRateLimit)
    .use("/mcp/*", edgeRateLimit)
    .get("/mcp", (c) =>
        c.json({
            data: MCP_SERVERS.map((server) => ({
                id: server.id,
                name: server.name,
                description: server.description,
                url: `${getPublicOrigin(c)}/mcp/${server.id}`,
                pricing: getMcpPricingInfo(server),
            })),
        }),
    )
    .use("/mcp/:serverId", auth(), frontendKeyRateLimit)
    .all("/mcp/:serverId", async (c) => {
        const user = c.var.auth.requireUser();
        if (
            c.req.method === "POST" &&
            Array.isArray(
                await c.req.raw
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            throw new HTTPException(400, {
                message: "MCP batch requests are not supported",
            });
        }
        const serverId = c.req.param("serverId");
        const server = getMcpServerDefinition(serverId);
        if (!server) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }
        const binding = c.env[server.binding] as Fetcher;

        const startedAt = new Date();
        const response = await binding.fetch(
            requestForMcp(c.req.raw, server, user.id),
        );
        if (server.billing === "usage_receipt") {
            const usage = parseMcpUsageHeaders(response.headers);
            if (usage) {
                try {
                    await settleUsage(c, server, usage, startedAt);
                    await c.var.frontendKeyRateLimit?.consumePollen(usage.cost);
                } catch (error) {
                    c.var.log.error("MCP billing failed: {error}", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
        }
        return responseForCaller(response);
    });
