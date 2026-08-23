import { getLogger } from "@logtape/logtape";
import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
import {
    type McpUsageReceipt,
    parseMcpUsageHeaders,
} from "@shared/mcp-usage.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    getMcpServerDefinition,
    MCP_CALLER_ID_HEADER,
    MCP_SERVERS,
    MCP_USAGE_HEADERS,
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
    callerId: string,
): Request {
    const headers = new Headers(request.headers);
    if (server.billing === "usage_receipt") {
        headers.delete("authorization");
    }
    headers.delete("cookie");
    headers.delete(MCP_CALLER_ID_HEADER);
    headers.set(MCP_CALLER_ID_HEADER, callerId);
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
        eventType: server.eventType,
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
            getLogger(["mcp", "track"]),
        ),
    );
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
            })),
        }),
    )
    .use("/mcp/:serverId", auth(), frontendKeyRateLimit)
    .all("/mcp/:serverId", async (c) => {
        const user = c.var.auth.requireUser();
        const serverId = c.req.param("serverId");
        const server = getMcpServerDefinition(serverId);
        if (!server) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }
        const binding = c.env[server.binding] as Fetcher;

        const startedAt = new Date();
        const callerId =
            c.var.auth.agentRun?.parentRequestId ??
            c.var.auth.apiKey?.id ??
            user.id;
        const response = await binding.fetch(
            requestForMcp(c.req.raw, server, callerId),
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
