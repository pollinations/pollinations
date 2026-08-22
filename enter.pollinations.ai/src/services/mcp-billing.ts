import { WorkerEntrypoint } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";
import {
    type ApiKeyAuthResult,
    authenticateApiKeyRequest,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import {
    createBalanceCheckResult,
    getUserBalance,
    payerBucketToMeter,
} from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
import { ensureConfigured } from "@shared/logger.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    type TinybirdEventType,
    usageEventIdentity,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";

export type McpBillingFailure = {
    ok: false;
    status: 401 | 403 | 503;
    message: string;
};

export type McpAuthorizationResult = { ok: true } | McpBillingFailure;

export type McpChargeResult = { ok: true; charge: number } | McpBillingFailure;

export type McpCharge = {
    requestId: string;
    mcpId: string;
    toolName: string;
    provider?: string;
    eventType: TinybirdEventType;
    startedAt: number;
    durationMs: number;
    responseStatus: number;
    amount: number;
    adjustment?: {
        id: string;
        units: number;
    };
    errorMessage?: string;
};

function bearerRequest(token: string): Request {
    return new Request("https://mcp.pollinations.ai", {
        headers: { Authorization: `Bearer ${token}` },
    });
}

async function authenticate(
    token: string,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<ApiKeyAuthResult | null> {
    return authenticateApiKeyRequest({
        request: bearerRequest(token),
        env,
        ctx,
    });
}

function authFailure(error: unknown): McpBillingFailure {
    if (
        error instanceof BannedAccountError ||
        error instanceof StagingAccessDeniedError
    ) {
        return { ok: false, status: 403, message: error.message };
    }
    return {
        ok: false,
        status: 503,
        message: "Unable to verify billing access. Please try again shortly.",
    };
}

function invalidKey(): McpBillingFailure {
    return {
        ok: false,
        status: 401,
        message:
            "A valid API key is required. Get one at https://enter.pollinations.ai/keys",
    };
}

function invalidCharge(): McpBillingFailure {
    return {
        ok: false,
        status: 503,
        message: "Unable to settle MCP billing.",
    };
}

export class McpBilling extends WorkerEntrypoint<CloudflareBindings> {
    async authorize(token: string): Promise<McpAuthorizationResult> {
        let auth: ApiKeyAuthResult | null;
        try {
            auth = await authenticate(token, this.env, this.ctx);
        } catch (error) {
            return authFailure(error);
        }
        if (!auth?.user?.id) return invalidKey();
        return { ok: true };
    }

    async charge(token: string, input: McpCharge): Promise<McpChargeResult> {
        if (!Number.isFinite(input.amount) || input.amount < 0) {
            return invalidCharge();
        }

        let auth: ApiKeyAuthResult | null;
        try {
            auth = await authenticate(token, this.env, this.ctx);
        } catch (error) {
            return authFailure(error);
        }
        if (!auth?.user?.id) return invalidKey();

        const durationMs = Math.max(1, Math.round(input.durationMs));
        const db = drizzle(this.env.DB);
        await ensureConfigured({
            level: this.env.LOG_LEVEL || "debug",
            format: this.env.LOG_FORMAT || "text",
        });
        const log = getLogger(["mcp", "billing"]);
        let balances: Awaited<ReturnType<typeof getUserBalance>>;
        let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>>;
        try {
            balances = await getUserBalance(db, auth.user.id);
            deduction = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: input.amount,
                userId: auth.user.id,
                apiKeyId: auth.apiKey.id,
                apiKeyPollenBalance: auth.apiKey.pollenBalance,
                byopClientKeyId: auth.apiKey.byopClientKeyId,
                modelPaidOnly: false,
            });
        } catch (error) {
            log.error("MCP billing settlement failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
            });
            return invalidCharge();
        }

        const startedAt = new Date(
            Math.min(Date.now(), Math.max(0, input.startedAt)),
        );
        const endedAt = new Date(startedAt.getTime() + durationMs);
        const balanceTracking = deduction.payerBucket
            ? payerBucketToMeter(deduction.payerBucket)
            : createBalanceCheckResult(balances);
        const adjustmentCosts = input.adjustment
            ? { [input.adjustment.id]: input.amount }
            : undefined;
        const adjustmentUnits = input.adjustment
            ? { [input.adjustment.id]: input.adjustment.units }
            : undefined;
        const event: TinybirdEvent = {
            id: crypto.randomUUID(),
            requestId: input.requestId,
            requestPath: `/mcp/${input.mcpId}/tools/${input.toolName}`,
            startTime: startedAt,
            endTime: endedAt,
            responseTime: durationMs,
            responseStatus: input.responseStatus,
            environment: this.env.ENVIRONMENT,
            eventType: input.eventType,
            ...usageEventIdentity(auth),
            ...balanceTracking,
            balances: {
                "v1:meter:tier": balances.tierBalance,
                "v1:meter:pack": balances.packBalance,
            },
            modelRequested: input.mcpId,
            resolvedModelRequested: input.mcpId,
            modelUsed: input.mcpId,
            modelProviderUsed: input.provider,
            fallbackUsed: false,
            isFinal: true,
            isBilledUsage: input.amount > 0,
            adjustmentCosts,
            adjustmentUnits,
            ...priceToEventParams(),
            ...usageToEventParams(),
            totalCost: input.amount,
            totalPrice: deduction.billedPrice,
            devPrice: input.amount,
            markupRate: deduction.markup?.markupRate ?? 0,
            errorResponseCode:
                input.responseStatus >= 400
                    ? String(input.responseStatus)
                    : undefined,
            errorSource:
                input.responseStatus >= 400
                    ? `${input.mcpId}.${input.toolName}`
                    : undefined,
            errorMessage:
                input.responseStatus >= 400
                    ? input.errorMessage?.slice(0, 1000)
                    : undefined,
        };
        this.ctx.waitUntil(
            sendToTinybird(
                event,
                this.env.TINYBIRD_INGEST_URL,
                this.env.TINYBIRD_INGEST_TOKEN,
                log,
            ),
        );

        return { ok: true, charge: deduction.billedPrice };
    }
}
