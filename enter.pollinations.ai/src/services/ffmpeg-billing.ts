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
import {
    calculateFfmpegCharge,
    FFMPEG_COST_PER_SECOND,
    FFMPEG_MODEL,
} from "@shared/ffmpeg.ts";
import { ensureConfigured } from "@shared/logger.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";

export type FfmpegBillingFailure = {
    ok: false;
    status: 401 | 403 | 503;
    message: string;
};

export type FfmpegAuthorizationResult = { ok: true } | FfmpegBillingFailure;

export type FfmpegSettlementResult =
    | { ok: true; charge: number }
    | FfmpegBillingFailure;

export type FfmpegSettlement = {
    requestId: string;
    startedAt: number;
    runtimeMs: number;
    responseStatus: number;
    errorMessage?: string;
};

const ADJUSTMENT_ID = "cloudflare.container.basic_runtime.v1";

function bearerRequest(token: string): Request {
    return new Request("https://ffmpeg.pollinations.ai", {
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

function authFailure(error: unknown): FfmpegBillingFailure {
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

function invalidKey(): FfmpegBillingFailure {
    return {
        ok: false,
        status: 401,
        message:
            "A valid API key is required. Get one at https://enter.pollinations.ai/keys",
    };
}

function keyIdentity(auth: ApiKeyAuthResult) {
    const metadata = auth.apiKey.metadata;
    const byopClientKeyId = auth.apiKey.byopClientKeyId;
    return {
        userId: auth.user?.id,
        userTier: auth.user?.tier,
        apiKeyId: auth.apiKey.id,
        apiKeyType: metadata?.keyType as "secret" | "publishable" | undefined,
        apiKeyName: auth.apiKey.name,
        apiKeyCreatedVia: byopClientKeyId
            ? "redirect-auth"
            : (metadata?.createdVia as string | undefined),
        apiKeyClientId: byopClientKeyId ?? undefined,
        apiKeyCreatedForApp: auth.apiKey.byopClientName ?? undefined,
        apiKeyCreatedForUserId: auth.apiKey.byopClientUserId ?? undefined,
    };
}

export class FfmpegBilling extends WorkerEntrypoint<CloudflareBindings> {
    async authorize(token: string): Promise<FfmpegAuthorizationResult> {
        let auth: ApiKeyAuthResult | null;
        try {
            auth = await authenticate(token, this.env, this.ctx);
        } catch (error) {
            return authFailure(error);
        }
        if (!auth?.user?.id) return invalidKey();
        return { ok: true };
    }

    async settle(
        token: string,
        settlement: FfmpegSettlement,
    ): Promise<FfmpegSettlementResult> {
        let auth: ApiKeyAuthResult | null;
        try {
            auth = await authenticate(token, this.env, this.ctx);
        } catch (error) {
            return authFailure(error);
        }
        if (!auth?.user?.id) return invalidKey();

        const runtimeMs = Math.max(1, Math.round(settlement.runtimeMs));
        const charge = calculateFfmpegCharge(runtimeMs);
        const db = drizzle(this.env.DB);
        await ensureConfigured({
            level: this.env.LOG_LEVEL || "debug",
            format: this.env.LOG_FORMAT || "text",
        });
        const log = getLogger(["ffmpeg", "billing"]);
        let balances: Awaited<ReturnType<typeof getUserBalance>>;
        let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>>;
        try {
            balances = await getUserBalance(db, auth.user.id);
            deduction = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: charge,
                userId: auth.user.id,
                apiKeyId: auth.apiKey.id,
                apiKeyPollenBalance: auth.apiKey.pollenBalance,
                byopClientKeyId: auth.apiKey.byopClientKeyId,
                modelPaidOnly: false,
            });
        } catch (error) {
            log.error("FFmpeg billing settlement failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                ok: false,
                status: 503,
                message: "Unable to settle FFmpeg billing.",
            };
        }

        const startedAt = new Date(
            Math.min(Date.now(), Math.max(0, settlement.startedAt)),
        );
        const endedAt = new Date(startedAt.getTime() + runtimeMs);
        const balanceTracking = deduction.payerBucket
            ? payerBucketToMeter(deduction.payerBucket)
            : createBalanceCheckResult(balances);
        const event: TinybirdEvent = {
            id: crypto.randomUUID(),
            requestId: settlement.requestId,
            requestPath: "/",
            startTime: startedAt,
            endTime: endedAt,
            responseTime: runtimeMs,
            responseStatus: settlement.responseStatus,
            environment: this.env.ENVIRONMENT,
            eventType: "tool.media",
            ...keyIdentity(auth),
            ...balanceTracking,
            balances: {
                "v1:meter:tier": balances.tierBalance,
                "v1:meter:pack": balances.packBalance,
            },
            modelRequested: FFMPEG_MODEL,
            resolvedModelRequested: FFMPEG_MODEL,
            modelUsed: FFMPEG_MODEL,
            modelProviderUsed: "cloudflare",
            fallbackUsed: false,
            isFinal: true,
            isBilledUsage: true,
            adjustmentCosts: { [ADJUSTMENT_ID]: charge },
            adjustmentUnits: { [ADJUSTMENT_ID]: runtimeMs / 1000 },
            ...priceToEventParams(),
            ...usageToEventParams(),
            totalCost: charge,
            totalPrice: deduction.billedPrice,
            devPrice: charge,
            markupRate: deduction.markup?.markupRate ?? 0,
            errorResponseCode:
                settlement.responseStatus >= 400
                    ? String(settlement.responseStatus)
                    : undefined,
            errorSource:
                settlement.responseStatus >= 400 ? "ffmpeg" : undefined,
            errorMessage:
                settlement.responseStatus >= 400
                    ? settlement.errorMessage?.slice(0, 1000)
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

export { FFMPEG_COST_PER_SECOND };
