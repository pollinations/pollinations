import type { Logger } from "@logtape/logtape";
import {
    cancelServiceAuthorization,
    createServiceAuthorization,
    settleServiceBillingEvents,
} from "@shared/billing/service-billing.ts";
import { sendToTinybirdOnce } from "@shared/events.ts";
import {
    type McpUsageReceipt,
    parseMcpUsageHeaders,
} from "@shared/mcp-usage.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    getMcpServerDefinition,
    MCP_SERVERS,
    MCP_USAGE_HEADERS,
    type McpServerDefinition,
} from "@shared/registry/mcp.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { type AuthVariables, auth } from "@/middleware/auth.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";

const SERVICE = "gen.pollinations.ai";

type UsageReceiptServer = Extract<
    McpServerDefinition,
    { billing: "usage_receipt" }
>;

type McpCaller = Pick<AuthVariables["auth"], "user" | "apiKey" | "agentRun">;

/**
 * Bill a usage-receipt MCP call through the shared service-billing engine
 * (gen shares Enter's database, so this is the same code path Enter's
 * ServiceGateway runs for other services, minus the RPC hop).
 *
 * Tool cost is known only after execution, so the authorization reserves
 * nothing (estimate 0) and the receipt is reconciled at settle: the same
 * per-request authorize/settle shape as every other service, with the
 * denial rules (bans, staging, negative balances) applied before the tool
 * runs.
 */
export async function authorizeMcpUsage(
    env: CloudflareBindings,
    caller: McpCaller,
    requestId: string,
    server: UsageReceiptServer,
): Promise<string> {
    const user = caller.user;
    const apiKey = caller.apiKey;
    if (!user || !apiKey) {
        throw new HTTPException(401, {
            message: "A valid API key is required",
        });
    }
    const created = await createServiceAuthorization(
        env.DB,
        {
            userId: user.id,
            userTier: user.tier ?? null,
            apiKeyId: apiKey.id,
            apiKeyName: apiKey.name ?? null,
            apiKeyType:
                (apiKey.metadata?.keyType as string | undefined) ?? null,
            byopClientKeyId: apiKey.byopClientKeyId ?? null,
            byopMarkupApplies: Boolean(apiKey.byopMarkupApplies),
            apiKeyPollenBalance: apiKey.pollenBalance,
        },
        {
            service: SERVICE,
            requestId,
            requestPath: `/mcp/${server.id}`,
            estimatedPrice: 0,
        },
    );
    if (!created.ok) {
        throw new HTTPException(created.denial.status, {
            message: created.denial.message,
        });
    }
    return created.authorizationId;
}

/** Settle the tool's receipt; then exactly one best-effort Tinybird write. */
export async function settleMcpUsage(
    env: CloudflareBindings,
    caller: McpCaller,
    authorizationId: string,
    server: UsageReceiptServer,
    usage: McpUsageReceipt,
    log: Logger,
    waitUntil: (task: Promise<unknown>) => void,
): Promise<void> {
    const result = await settleServiceBillingEvents(
        env.DB,
        {
            authorizationId,
            events: [
                {
                    eventId: "usage",
                    eventType: server.eventType,
                    price: usage.cost,
                    modelUsed: server.id,
                    telemetry: {
                        responseStatus: usage.status,
                        ...requestIdentity(caller),
                        modelRequested: server.id,
                        resolvedModelRequested: server.id,
                        modelProviderUsed: server.provider,
                        fallbackUsed: false,
                        isFinal: true,
                        adjustmentCosts: { [usage.adjustmentId]: usage.cost },
                        adjustmentUnits: {
                            [usage.adjustmentId]: usage.adjustmentUnits,
                        },
                        totalCost: usage.cost,
                        errorResponseCode:
                            usage.status >= 400
                                ? String(usage.status)
                                : undefined,
                        errorSource:
                            usage.status >= 400
                                ? `${server.id}.${usage.tool}`
                                : undefined,
                        errorMessage:
                            usage.status >= 400 ? usage.error : undefined,
                    },
                },
            ],
        },
        { environment: env.ENVIRONMENT },
    );
    if (!result.ok) {
        throw new Error(`MCP settlement failed: ${result.error}`);
    }
    for (const outcome of result.outcomes) {
        waitUntil(
            sendToTinybirdOnce(
                outcome.tinybirdEvent,
                env.TINYBIRD_INGEST_URL,
                env.TINYBIRD_INGEST_TOKEN,
                log,
            ),
        );
    }
}

function requestForMcp(request: Request, server: McpServerDefinition): Request {
    const headers = new Headers(request.headers);
    if (server.billing === "usage_receipt") {
        headers.delete("authorization");
    }
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
        c.var.auth.requireUser();
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

        if (server.billing !== "usage_receipt") {
            return responseForCaller(
                await binding.fetch(requestForMcp(c.req.raw, server)),
            );
        }

        // Authorize before the tool runs; the upstream call is never
        // retried, so a failed or receipt-less call is canceled, not replayed.
        const authorizationId = await authorizeMcpUsage(
            c.env,
            c.var.auth,
            c.get("requestId"),
            server,
        );
        let response: Response;
        try {
            response = await binding.fetch(requestForMcp(c.req.raw, server));
        } catch (error) {
            c.executionCtx.waitUntil(
                cancelServiceAuthorization(c.env.DB, authorizationId),
            );
            throw error;
        }
        const usage = parseMcpUsageHeaders(response.headers);
        if (!usage) {
            c.executionCtx.waitUntil(
                cancelServiceAuthorization(c.env.DB, authorizationId),
            );
            return responseForCaller(response);
        }
        try {
            await settleMcpUsage(
                c.env,
                c.var.auth,
                authorizationId,
                server,
                usage,
                c.var.log,
                (task) => c.executionCtx.waitUntil(task),
            );
            await c.var.frontendKeyRateLimit?.consumePollen(usage.cost);
        } catch (error) {
            c.var.log.error("MCP billing failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return responseForCaller(response);
    });
