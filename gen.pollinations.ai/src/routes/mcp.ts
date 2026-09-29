import type { AuthUser } from "@shared/auth/api-key.ts";
import { payerBucketToMeter } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
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
    MCP_USER_GITHUB_HEADER,
    MCP_USER_ID_HEADER,
    MCP_VAULT_ACTOR_HEADER,
    MCP_VAULT_PERMISSIONS_HEADER,
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

const VAULT_REQUEST_MAX_BYTES = 131_072;
type VaultAccess = "discovery" | "read" | "write";

async function vaultAccessForRequest(request: Request): Promise<{
    access: VaultAccess;
    body: Uint8Array<ArrayBuffer>;
}> {
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
        if (!/^\d+$/.test(contentLength)) {
            throw new HTTPException(400, { message: "Invalid Vault request" });
        }
        if (Number(contentLength) > VAULT_REQUEST_MAX_BYTES) {
            throw new HTTPException(413, {
                message: "Vault request too large",
            });
        }
    }
    const reader = request.body?.getReader();
    if (!reader)
        throw new HTTPException(400, { message: "Invalid Vault request" });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > VAULT_REQUEST_MAX_BYTES) {
            await reader.cancel();
            throw new HTTPException(413, {
                message: "Vault request too large",
            });
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    let body: unknown;
    try {
        body = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
    } catch {
        throw new HTTPException(400, { message: "Invalid Vault request" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HTTPException(400, { message: "Invalid Vault request" });
    }
    const rpc = body as { method?: unknown; params?: { name?: unknown } };
    if (
        rpc.method === "initialize" ||
        rpc.method === "notifications/initialized" ||
        rpc.method === "tools/list" ||
        rpc.method === "resources/list" ||
        rpc.method === "resources/templates/list" ||
        rpc.method === "prompts/list"
    ) {
        return { access: "discovery", body: bytes };
    }
    if (rpc.method === "tools/call" && rpc.params?.name === "write")
        return { access: "write", body: bytes };
    if (
        rpc.method === "tools/call" &&
        (rpc.params?.name === "read" || rpc.params?.name === "search")
    ) {
        return { access: "read", body: bytes };
    }
    if (rpc.method === "ping") return { access: "discovery", body: bytes };
    throw new HTTPException(400, { message: "Unsupported Vault request" });
}

function requireVaultAccess(
    permissions: string[] | undefined,
    required: VaultAccess,
): void {
    if (
        !permissions?.length ||
        (required !== "discovery" && !permissions.includes(required))
    ) {
        throw new HTTPException(403, {
            message: "API key lacks required memory permission",
        });
    }
}

function requestForMcp(
    request: Request,
    server: McpServerDefinition,
    user: AuthUser,
    apiKeyId: string | undefined,
    managedAgentId: string | undefined,
    memoryPermissions: string[] | undefined,
    vaultBody?: Uint8Array<ArrayBuffer>,
): Request {
    const headers = new Headers(request.headers);
    if (server.billing === "usage_receipt" || server.billing === "free") {
        headers.delete("authorization");
    }
    headers.delete("cookie");
    headers.delete(MCP_USER_ID_HEADER);
    headers.delete(MCP_USER_GITHUB_HEADER);
    headers.delete(MCP_VAULT_ACTOR_HEADER);
    headers.delete(MCP_VAULT_PERMISSIONS_HEADER);
    if (server.userScoped) {
        headers.set(MCP_USER_ID_HEADER, user.id);
        if (user.githubId && user.githubUsername) {
            headers.set(
                MCP_USER_GITHUB_HEADER,
                `${user.githubId}+${user.githubUsername}`,
            );
        }
    }
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        headers.delete(header);
    }
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = "mcp.internal";
    url.pathname = "/";
    if (server.id === "vault") {
        headers.set(MCP_USER_ID_HEADER, user.id);
        headers.set(
            MCP_VAULT_ACTOR_HEADER,
            JSON.stringify([apiKeyId, managedAgentId ?? null]),
        );
        headers.set(
            MCP_VAULT_PERMISSIONS_HEADER,
            JSON.stringify(Array.from(new Set(memoryPermissions))),
        );
        for (const credential of [
            "key",
            "api_key",
            "access_token",
            "authorization",
            "token",
        ]) {
            url.searchParams.delete(credential);
        }
    }
    return new Request(url, {
        method: request.method,
        headers,
        body:
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : (vaultBody ?? request.body),
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
        const serverId = c.req.param("serverId");
        const server = getMcpServerDefinition(serverId);
        if (!server) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }
        let vaultBody: Uint8Array<ArrayBuffer> | undefined;
        if (server.id === "vault" && c.req.method === "POST") {
            const vaultRequest = await vaultAccessForRequest(c.req.raw);
            vaultBody = vaultRequest.body;
            requireVaultAccess(
                c.var.auth.apiKey?.permissions?.memory,
                vaultRequest.access,
            );
        }
        if (
            server.id !== "vault" &&
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
        const binding = c.env[server.binding] as Fetcher;

        const startedAt = new Date();
        const response = await binding.fetch(
            requestForMcp(
                c.req.raw,
                server,
                user,
                c.var.auth.apiKey?.id,
                c.var.auth.agentRun?.managedAgentId,
                c.var.auth.apiKey?.permissions?.memory,
                vaultBody,
            ),
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
