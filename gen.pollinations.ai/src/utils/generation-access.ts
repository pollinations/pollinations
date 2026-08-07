import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { atomicReserveApiKeyBalance } from "@shared/billing/deduction.ts";
import { isFreeCommunityEndpoint } from "@shared/community-endpoints.ts";
import { getModelStats } from "@shared/utils/model-stats.ts";
import { drizzle } from "drizzle-orm/d1";
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
    const communityEndpoint = model.communityEndpoint;
    const isFreeCommunityModel =
        communityEndpoint !== undefined &&
        isFreeCommunityEndpoint(communityEndpoint);

    const apiKey = auth.apiKey;
    const requiredBudget = Math.max(0, estimatedCost);
    // Reserved, not just compared: the balance read at auth time is a snapshot,
    // so concurrent requests on one key would all clear a plain check and only
    // discover the budget was gone at settlement, well after they were served.
    if (
        !isFreeCommunityModel &&
        apiKey &&
        typeof apiKey.pollenBalance === "number"
    ) {
        const { ok, reserved } = await atomicReserveApiKeyBalance(
            drizzle(env.DB),
            apiKey.id,
            requiredBudget,
        );
        if (!ok) {
            throw new HTTPException(402, {
                message: `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen, but this key has ${Math.max(0, apiKey.pollenBalance).toFixed(4)}.`,
            });
        }
        balance.apiKeyReservation = { apiKeyId: apiKey.id, amount: reserved };
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
