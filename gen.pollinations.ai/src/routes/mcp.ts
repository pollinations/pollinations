import { getLogger } from "@logtape/logtape";
import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    getMcpServerDefinition,
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
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";

type McpUsage = {
    cost: number;
    tool: string;
    status: number;
    adjustmentId: string;
    adjustmentUnits: number;
    error?: string;
};

function getMcpBinding(
    env: CloudflareBindings,
    id: string,
): Fetcher | undefined {
    if (id === "ffmpeg") return env.FFMPEG_MCP;
    return undefined;
}

function parseUsage(headers: Headers): McpUsage | undefined {
    const costHeader = headers.get(MCP_USAGE_HEADERS.cost);
    if (costHeader === null) return undefined;

    const cost = Number(costHeader);
    const status = Number(headers.get(MCP_USAGE_HEADERS.status));
    const adjustmentUnits = Number(
        headers.get(MCP_USAGE_HEADERS.adjustmentUnits),
    );
    const tool = headers.get(MCP_USAGE_HEADERS.tool);
    const adjustmentId = headers.get(MCP_USAGE_HEADERS.adjustmentId);
    if (
        !Number.isFinite(cost) ||
        cost < 0 ||
        !Number.isInteger(status) ||
        status < 100 ||
        status > 599 ||
        !Number.isFinite(adjustmentUnits) ||
        adjustmentUnits < 0 ||
        !tool ||
        !adjustmentId
    ) {
        throw new Error("MCP server returned invalid usage metadata");
    }
    return {
        cost,
        status,
        adjustmentUnits,
        tool,
        adjustmentId,
        error: headers.get(MCP_USAGE_HEADERS.error) ?? undefined,
    };
}

function requestForMcp(request: Request): Request {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("cookie");
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
    server: McpServerDefinition,
    usage: McpUsage,
    startedAt: Date,
): Promise<void> {
    const user = c.var.auth.requireUser();
    const db = drizzle(c.env.DB);
    const balances = await getUserBalance(db, user.id);
    const deduction = await handleBalanceDeduction({
        db: db as unknown as Parameters<typeof handleBalanceDeduction>[0]["db"],
        isBilledUsage: usage.cost > 0,
        totalPrice: usage.cost,
        userId: user.id,
        apiKeyId: c.var.auth.apiKey?.id,
        apiKeyPollenBalance: c.var.auth.apiKey?.pollenBalance,
        byopClientKeyId: c.var.auth.apiKey?.byopClientKeyId,
        modelPaidOnly: false,
    });
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
        ...(deduction.payerBucket
            ? payerBucketToMeter(deduction.payerBucket)
            : {}),
        balances: {
            "v1:meter:tier": balances.tierBalance,
            "v1:meter:pack": balances.packBalance,
        },
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
        totalPrice: deduction.billedPrice,
        devPrice: usage.cost,
        markupRate: deduction.markup?.markupRate ?? 0,
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
    .use("/mcp/:serverId", auth())
    .all("/mcp/:serverId", async (c) => {
        c.var.auth.requireUser();
        const serverId = c.req.param("serverId");
        const server = getMcpServerDefinition(serverId);
        const binding = getMcpBinding(c.env, serverId);
        if (!server || !binding) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }

        const startedAt = new Date();
        const response = await binding.fetch(requestForMcp(c.req.raw));
        const usage = parseUsage(response.headers);
        if (usage) {
            try {
                await settleUsage(c, server, usage, startedAt);
            } catch (error) {
                c.var.log.error("MCP billing failed: {error}", {
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
        return responseForCaller(response);
    });
