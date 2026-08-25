import { getLogger } from "@logtape/logtape";
import type { AuthUser } from "@shared/auth/api-key.ts";
import {
    type ApiKeyAuthResult,
    authenticateApiKeyValue,
    BannedAccountError,
    StagingAccessDeniedError,
} from "@shared/auth/api-key.ts";
import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import {
    cancelServiceAuthorization,
    createServiceAuthorization,
    settleServiceBillingEvents,
    sweepServiceBilling,
} from "@shared/billing/service-billing.ts";
import { sendToTinybirdOnce } from "@shared/events.ts";
import type {
    ServiceAuthorizeInput,
    ServiceAuthorizeResult,
    ServiceCancelResult,
    ServiceDenial,
    ServiceSettleInput,
    ServiceSettleResult,
    TokenIntrospectionResult,
} from "@shared/schemas/service-billing.ts";
import { processAutoTopUpForUser } from "../utils/stripe-billing/index.ts";

const log = getLogger(["service-gateway"]);

/**
 * Enter-side face of the ServiceGateway RPC entrypoint: authenticates raw
 * credentials and applies key policy, then delegates all money movement to
 * the shared service-billing engine (shared/billing/service-billing.ts).
 * See shared/schemas/service-billing.ts for the wire contract.
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
    const { user, apiKey } = auth;

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
            service: input.service,
            requestId: input.requestId,
            requestPath: input.requestPath,
            estimatedPrice: input.estimatedPrice,
            paidOnly: input.paidOnly,
        },
    );
    if (!created.ok) {
        return created;
    }

    return {
        ok: true,
        authorizationId: created.authorizationId,
        user: { id: user.id, tier: user.tier },
        apiKey: stripRawKey(auth),
        agentRun: auth.agentRun,
    };
}

/**
 * Settle billable events. Money moves atomically in the engine; the Tinybird
 * row per newly settled event is exactly one best-effort fetch afterwards
 * (a failure is logged, never retried), backgrounded through `waitUntil`
 * when given one.
 */
export async function settleServiceEvents(
    env: CloudflareBindings,
    input: ServiceSettleInput,
    waitUntil?: (task: Promise<unknown>) => void,
): Promise<ServiceSettleResult> {
    const pending: Promise<unknown>[] = [];
    const background = waitUntil ?? ((task) => pending.push(task));
    const result = await settleServiceBillingEvents(env.DB, input, {
        environment: env.ENVIRONMENT,
    });
    if (!result.ok) {
        return result;
    }

    for (const outcome of result.outcomes) {
        background(
            sendToTinybirdOnce(
                outcome.tinybirdEvent,
                env.TINYBIRD_INGEST_URL,
                env.TINYBIRD_INGEST_TOKEN,
                log,
            ),
        );
    }

    const needsTopUp = result.outcomes.some(
        (outcome) =>
            outcome.billedPrice > 0 &&
            outcome.payerBucket === "pack" &&
            outcome.postDeductionPackBalance != null &&
            outcome.postDeductionPackBalance <= AUTO_TOP_UP_THRESHOLD_POLLEN,
    );
    if (needsTopUp) {
        try {
            await processAutoTopUpForUser(env, result.userId);
        } catch (error) {
            log.warn("Auto top-up after service settlement failed: {error}", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    await Promise.all(pending);
    return { ok: true, settled: result.settled, duplicates: result.duplicates };
}

export async function cancelServiceRequest(
    env: CloudflareBindings,
    authorizationId: string,
): Promise<ServiceCancelResult> {
    return cancelServiceAuthorization(env.DB, authorizationId);
}

/**
 * Release expired reservations and prune long-expired rows; run in the
 * background after gateway calls.
 */
export async function sweepServiceGateway(
    env: CloudflareBindings,
): Promise<void> {
    try {
        await sweepServiceBilling(env.DB);
    } catch (error) {
        log.warn("Service billing sweep failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
