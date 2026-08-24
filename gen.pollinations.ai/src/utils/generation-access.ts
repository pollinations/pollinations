import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import type { BillingAuthorization } from "@shared/schemas/billable-event.ts";
import { getModelStats } from "@shared/utils/model-stats.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { getEstimatedPrice } from "@/utils/model-stats.ts";

type GenerationAccessVariables = AuthVariables &
    BalanceVariables &
    ModelVariables &
    LoggerVariables;

type GenerationAccessEnv = {
    Bindings: CloudflareBindings;
    Variables: GenerationAccessVariables;
};

export type GenerationBillingRequest = {
    token: string;
    authorization: BillingAuthorization;
};

export function authorizationFailure(error: string): HTTPException {
    switch (error) {
        case "invalid_api_key":
            return new HTTPException(401, {
                message:
                    "A valid API key is required. Get one at https://enter.pollinations.ai/keys",
            });
        case "forbidden":
        case "model_not_allowed":
            return new HTTPException(403, {
                message: "This API key cannot use the requested model",
            });
        case "insufficient_balance_or_budget":
            return new HTTPException(402, {
                message:
                    "Insufficient balance or API key budget for this request",
            });
        case "authorization_conflict":
        case "authorization_closed":
            return new HTTPException(409, {
                message:
                    "This request id already belongs to closed billing work",
            });
        default:
            return new HTTPException(500, {
                message: "Unable to authorize billing for this request",
            });
    }
}

/** Read-only preflight. The execution owner reserves later, after deduplication. */
export async function checkBalance(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    const { auth, balance, model, log } = vars;
    const user = auth.requireUser();
    auth.requireModelAccess();
    if (!auth.apiKey?.rawKey || !auth.balances) {
        throw new HTTPException(401, {
            message:
                "A valid API key is required. Get one at https://enter.pollinations.ai/keys",
        });
    }

    const paidOnly = model.definition.paidOnly ?? false;
    const estimatedPrice = Math.max(
        0,
        getEstimatedPrice(
            await getModelStats(env.KV, log),
            model.resolved,
            model.definition,
        ),
    );
    if (
        typeof auth.apiKey.pollenBalance === "number" &&
        auth.apiKey.pollenBalance < estimatedPrice
    ) {
        throw new HTTPException(402, {
            message: "API key budget is too low for this request",
        });
    }
    if (!canCoverEstimatedCharge(auth.balances, estimatedPrice, paidOnly)) {
        throw new HTTPException(402, {
            message: "Insufficient balance for this request",
        });
    }

    balance.balanceCheckResult = createBalanceCheckResult(
        auth.balances,
        paidOnly,
    );
    balance.billingEstimatePrice = estimatedPrice;
    if (user.id !== auth.user?.id) {
        throw new HTTPException(500, {
            message: "Generation identity is inconsistent",
        });
    }
}

export function generationBillingRequest(
    vars: GenerationAccessVariables,
    requestId: string,
): GenerationBillingRequest {
    const token = vars.auth.apiKey?.rawKey;
    const estimatedPrice = vars.balance.billingEstimatePrice;
    if (!token || estimatedPrice === undefined) {
        throw new Error("Generation billing preflight is missing");
    }
    return {
        token,
        authorization: {
            producer: "gen.pollinations.ai",
            requestId,
            estimatedPrice,
            paidOnly: vars.model.definition.paidOnly ?? false,
            model: vars.model.resolved,
        },
    };
}

export async function authorizeGenerationBilling(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
    requestId: string,
): Promise<string> {
    if (vars.balance.billingAuthorizationId) {
        return vars.balance.billingAuthorizationId;
    }
    const request = generationBillingRequest(vars, requestId);
    const result = await env.ENTER_BILLING.authorize(
        request.token,
        request.authorization,
    );
    if (!result.ok) throw authorizationFailure(result.error);
    vars.balance.billingAuthorizationId = result.grant.id;
    return result.grant.id;
}

export async function cancelGenerationAuthorization(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    const authorizationId = vars.balance.billingAuthorizationId;
    if (!authorizationId) return;
    await env.ENTER_BILLING.cancel(authorizationId);
    vars.balance.billingAuthorizationId = undefined;
}

export const billingAuthorization = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await authorizeGenerationBilling(c.var, c.env, c.get("requestId"));
        try {
            await next();
        } catch (error) {
            await cancelGenerationAuthorization(c.var, c.env);
            throw error;
        }
    },
);

export const generationAccess = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await checkBalance(c.var, c.env);
        await next();
    },
);
