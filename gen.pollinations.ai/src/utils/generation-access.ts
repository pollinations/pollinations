import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import {
    communityModelEndpoints,
    isFreeCommunityEndpoint,
} from "@shared/community-endpoints.ts";
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

export async function checkBalance(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    const { auth, balance, model, log } = vars;
    if (!auth.user?.id) return;

    const isPaidOnly = model.definition.paidOnly ?? false;
    const estimatedCost = getEstimatedPrice(
        await getModelStats(env.KV, log),
        model.resolved,
    );
    // A pooled `group/<name>` is backed by its members, so read the endpoints
    // rather than `communityEndpoint`: otherwise a free pool is billed like a
    // paid model and 402s the zero-balance users it exists to serve.
    const communityEndpoints = communityModelEndpoints(model);
    const isFreeCommunityModel =
        communityEndpoints.length > 0 &&
        communityEndpoints.every(isFreeCommunityEndpoint);

    const apiKeyBudget = auth.apiKey?.pollenBalance;
    const requiredBudget = Math.max(0, estimatedCost);
    if (
        !isFreeCommunityModel &&
        typeof apiKeyBudget === "number" &&
        apiKeyBudget <= requiredBudget
    ) {
        throw new HTTPException(402, {
            message: `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen, but this key has ${Math.max(0, apiKeyBudget).toFixed(4)}.`,
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    if (
        !isFreeCommunityModel &&
        !canCoverEstimatedCharge(userBalance, estimatedCost, isPaidOnly)
    ) {
        const available = isPaidOnly
            ? userBalance.packBalance
            : Math.max(userBalance.tierBalance, userBalance.packBalance);
        throw new HTTPException(402, {
            message: `Insufficient balance. This request costs ~${estimatedCost.toFixed(4)} pollen, but your available balance is ${Math.max(0, available).toFixed(4)}.`,
        });
    }

    balance.balanceCheckResult = createBalanceCheckResult(
        userBalance,
        isPaidOnly,
    );
}

export async function requireGenerationAccess(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    await vars.auth.requireAuthorization();
    vars.auth.requireModelAccess();
    await checkBalance(vars, env);
}

export const generationAccess = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await requireGenerationAccess(c.var, c.env);
        await next();
    },
);
