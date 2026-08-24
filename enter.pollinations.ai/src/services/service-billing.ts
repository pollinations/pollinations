import { getLogger } from "@logtape/logtape";
import type { AuthUser } from "@shared/auth/api-key.ts";
import {
    type ApiKeyAuthResult,
    authenticateApiKeyValue,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import type { ApiKeyType } from "@shared/auth/api-key-creation.ts";
import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import {
    atomicAdjustApiKeyBalance,
    atomicReserveApiKeyBalance,
} from "@shared/billing/deduction.ts";
import { withByopMarkup } from "@shared/billing/markup.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import {
    serviceAuthorization,
    serviceBillingEvent,
} from "@shared/db/service-billing.ts";
import { sendToTinybird } from "@shared/events.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import type {
    ServiceAuthorizeInput,
    ServiceAuthorizeResult,
    ServiceDenial,
    ServiceSettleInput,
    ServiceSettleResult,
    TokenIntrospectionResult,
} from "@shared/schemas/service-billing.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { processAutoTopUpForUser } from "../utils/stripe-billing/index.ts";

const log = getLogger(["service-gateway"]);

/**
 * Backing logic for the ServiceGateway RPC entrypoint: Enter-side auth and
 * billing for trusted services (media, and eventually gen) that do their own
 * work but must never own auth or money movement. See
 * shared/schemas/service-billing.ts for the wire contract and
 * shared/db/service-billing.ts for the ledger tables.
 */

type UserAuthResult = ApiKeyAuthResult & { user: AuthUser };

type AuthOutcome =
    | { auth: UserAuthResult }
    | { auth: null; denial: ServiceDenial };

function hasUser(auth: ApiKeyAuthResult): auth is UserAuthResult {
    return auth.user !== undefined;
}

async function authenticateToken(
    env: CloudflareBindings,
    token: string,
): Promise<AuthOutcome> {
    try {
        const auth = await authenticateApiKeyValue(token, { env });
        if (!auth || !hasUser(auth)) {
            return {
                auth: null,
                denial: {
                    status: 401,
                    message:
                        "A valid API key is required. Get one at https://enter.pollinations.ai/keys",
                },
            };
        }
        return { auth };
    } catch (error) {
        if (
            error instanceof BannedAccountError ||
            error instanceof StagingAccessDeniedError
        ) {
            return {
                auth: null,
                denial: { status: 403, message: error.message },
            };
        }
        throw error;
    }
}

function stripRawKey(auth: ApiKeyAuthResult) {
    const { rawKey: _rawKey, ...apiKey } = auth.apiKey;
    return apiKey;
}

export async function introspectServiceToken(
    env: CloudflareBindings,
    token: string,
): Promise<TokenIntrospectionResult> {
    const outcome = await authenticateToken(env, token);
    if (!outcome.auth) {
        return { valid: false, denial: outcome.denial };
    }
    const { auth } = outcome;
    return {
        valid: true,
        user: { id: auth.user.id, tier: auth.user.tier },
        apiKey: stripRawKey(auth),
        agentRun: auth.agentRun,
    };
}

export async function authorizeServiceRequest(
    env: CloudflareBindings,
    input: ServiceAuthorizeInput,
): Promise<ServiceAuthorizeResult> {
    const outcome = await authenticateToken(env, input.token);
    if (!outcome.auth) {
        return { ok: false, denial: outcome.denial };
    }
    const { auth } = outcome;
    const user = auth.user;
    const apiKey = auth.apiKey;

    const allowedModels = apiKey.permissions?.models;
    if (input.model && allowedModels && !allowedModels.includes(input.model)) {
        return {
            ok: false,
            denial: {
                status: 403,
                message: `Model '${input.model}' is not allowed for this API key`,
            },
        };
    }

    const isPaidOnly = input.paidOnly ?? false;
    const estimatedCost = withByopMarkup(
        Math.max(0, input.estimatedPrice),
        Boolean(apiKey.byopMarkupApplies),
    );

    const db = drizzle(env.DB);
    const balances = await getUserBalance(db, user.id);
    if (!canCoverEstimatedCharge(balances, estimatedCost, isPaidOnly)) {
        return {
            ok: false,
            denial: {
                status: 402,
                message: `Insufficient balance. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
            },
        };
    }

    // Reserve the estimate from a finite key budget before the service does
    // any expensive work; concurrent requests race on the same atomic UPDATE,
    // so the sum of reservations can never exceed the live budget.
    const hasBudget = typeof apiKey.pollenBalance === "number";
    let reserved = 0;
    if (hasBudget) {
        const reservation = await atomicReserveApiKeyBalance(
            db,
            apiKey.id,
            estimatedCost,
        );
        if (!reservation.ok) {
            return {
                ok: false,
                denial: {
                    status: 402,
                    message: `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen.`,
                },
            };
        }
        reserved = reservation.reserved;
    }

    const authorized = {
        ok: true as const,
        user: { id: user.id, tier: user.tier },
        apiKey: stripRawKey(auth),
        agentRun: auth.agentRun,
    };

    const authorizationId = crypto.randomUUID();
    try {
        await db.insert(serviceAuthorization).values({
            id: authorizationId,
            service: input.service,
            requestId: input.requestId,
            requestPath: input.requestPath,
            userId: user.id,
            userTier: user.tier,
            apiKeyId: apiKey.id,
            apiKeyName: apiKey.name,
            apiKeyType: apiKey.metadata?.keyType as ApiKeyType | undefined,
            byopClientKeyId: apiKey.byopClientKeyId,
            paidOnly: isPaidOnly,
            apiKeyHasBudget: hasBudget,
            reservedRemaining: reserved,
            createdAt: new Date(),
        });
    } catch (error) {
        // A retried authorize for the same (service, requestId) hits the
        // unique index: hand back the existing authorization so retries never
        // stack reservations.
        const existing = await db
            .select({ id: serviceAuthorization.id })
            .from(serviceAuthorization)
            .where(
                and(
                    eq(serviceAuthorization.service, input.service),
                    eq(serviceAuthorization.requestId, input.requestId),
                ),
            )
            .get();
        if (!existing) throw error;
        if (reserved > 0) {
            await atomicAdjustApiKeyBalance(db, apiKey.id, -reserved);
        }
        return { ...authorized, authorizationId: existing.id };
    }

    return { ...authorized, authorizationId };
}

export async function settleServiceEvents(
    env: CloudflareBindings,
    input: ServiceSettleInput,
): Promise<ServiceSettleResult> {
    const db = drizzle(env.DB);
    const authorization = await db
        .select()
        .from(serviceAuthorization)
        .where(eq(serviceAuthorization.id, input.authorizationId))
        .get();
    if (!authorization) {
        return { ok: false, error: "unknown_authorization" };
    }

    const settled: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();
    const settleTime = new Date();

    for (const event of input.events) {
        if (seen.has(event.eventId)) continue;
        seen.add(event.eventId);

        // The idempotency row is claimed before money moves: a crash between
        // the two loses at most one under-charge, never a double debit — the
        // same one-debit direction the durable media coordinator guarantees.
        const claim = await db
            .insert(serviceBillingEvent)
            .values({
                authorizationId: authorization.id,
                eventId: event.eventId,
                billedPrice: 0,
                createdAt: settleTime,
            })
            .onConflictDoNothing()
            .returning({ eventId: serviceBillingEvent.eventId });
        if (claim.length === 0) {
            duplicates.push(event.eventId);
            continue;
        }

        // Claim the outstanding reservation exactly once (CAS guards a
        // concurrent settle for the same authorization); later events
        // reconcile against zero and debit the key for their full price.
        let reservedForEvent = 0;
        if (authorization.apiKeyHasBudget) {
            if (authorization.reservedRemaining > 0) {
                const claimed = await db
                    .update(serviceAuthorization)
                    .set({ reservedRemaining: 0 })
                    .where(
                        and(
                            eq(serviceAuthorization.id, authorization.id),
                            eq(
                                serviceAuthorization.reservedRemaining,
                                authorization.reservedRemaining,
                            ),
                        ),
                    )
                    .returning({ id: serviceAuthorization.id });
                if (claimed.length > 0) {
                    reservedForEvent = authorization.reservedRemaining;
                }
                authorization.reservedRemaining = 0;
            }
        }

        // A deduction failure deliberately leaves the claim row in place:
        // handleBalanceDeduction may throw after the payer was debited (credit
        // failures), so releasing the claim for a retry could double-debit.
        // Like gen's post-response billing, a failure here loses revenue,
        // never user money.
        const deduction = await handleBalanceDeduction({
            db,
            isBilledUsage: event.price > 0,
            totalPrice: event.price,
            userId: authorization.userId,
            apiKeyId: authorization.apiKeyId,
            // Only its presence matters: hasApiKeyBudget() gates on "is a
            // number", and the reservation snapshot replaces the live value.
            apiKeyPollenBalance: authorization.apiKeyHasBudget ? 0 : null,
            apiKeyReservedAmount: authorization.apiKeyHasBudget
                ? reservedForEvent
                : undefined,
            byopClientKeyId: authorization.byopClientKeyId,
            modelPaidOnly: authorization.paidOnly,
        });

        if (deduction.billedPrice > 0) {
            await db
                .update(serviceBillingEvent)
                .set({ billedPrice: deduction.billedPrice })
                .where(
                    and(
                        eq(
                            serviceBillingEvent.authorizationId,
                            authorization.id,
                        ),
                        eq(serviceBillingEvent.eventId, event.eventId),
                    ),
                );
        }
        settled.push(event.eventId);

        const meter = deduction.payerBucket
            ? payerBucketToMeter(deduction.payerBucket)
            : {};
        const tinybirdEvent: TinybirdEvent = {
            id: crypto.randomUUID(),
            requestId: authorization.requestId,
            requestPath: authorization.requestPath,
            startTime: authorization.createdAt,
            endTime: settleTime,
            responseTime:
                settleTime.getTime() - authorization.createdAt.getTime(),
            responseStatus: 200,
            environment: env.ENVIRONMENT,
            eventType: event.eventType,
            userId: authorization.userId,
            userTier: authorization.userTier ?? undefined,
            apiKeyId: authorization.apiKeyId,
            apiKeyName: authorization.apiKeyName ?? undefined,
            apiKeyType:
                (authorization.apiKeyType as ApiKeyType | null) ?? undefined,
            apiKeyClientId: authorization.byopClientKeyId ?? undefined,
            modelUsed: event.modelUsed,
            isBilledUsage: event.price > 0,
            // Service events are priced as a whole, not from token usage; the
            // zeroed sheets keep the row shape identical to gen's.
            ...priceToEventParams(),
            ...usageToEventParams(),
            ...meter,
            totalCost: 0,
            totalPrice: deduction.billedPrice,
            devPrice: event.price,
            markupRate: deduction.markup?.markupRate ?? 0,
        };
        await sendToTinybird(
            tinybirdEvent,
            env.TINYBIRD_INGEST_URL,
            env.TINYBIRD_INGEST_TOKEN,
            log,
        );

        if (
            event.price > 0 &&
            deduction.payerBucket === "pack" &&
            deduction.postDeductionPackBalance != null &&
            deduction.postDeductionPackBalance <= AUTO_TOP_UP_THRESHOLD_POLLEN
        ) {
            await triggerAutoTopUpIfConfigured(env, authorization.userId);
        }
    }

    if (settled.length > 0 && !authorization.settledAt) {
        await db
            .update(serviceAuthorization)
            .set({ settledAt: settleTime })
            .where(eq(serviceAuthorization.id, authorization.id));
    }

    return { ok: true, settled, duplicates };
}

async function triggerAutoTopUpIfConfigured(
    env: CloudflareBindings,
    userId: string,
): Promise<void> {
    try {
        await processAutoTopUpForUser(env, userId);
    } catch (error) {
        log.warn("Auto top-up after service settlement failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
