import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { getEstimatedPrice, getModelStats } from "@/utils/model-stats.ts";

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

    const serviceDefinition = getModelDefinition(model.resolved);
    const isPaidOnly = serviceDefinition.paidOnly ?? false;

    const stats = await getModelStats(env.KV, log);
    const estimatedCost = getEstimatedPrice(stats, model.resolved);

    const apiKeyBudget = auth.apiKey?.pollenBalance;
    const requiredBudget = Math.max(0, estimatedCost);
    if (typeof apiKeyBudget === "number" && apiKeyBudget <= requiredBudget) {
        throw new HTTPException(402, {
            message: `API key budget too low. This model costs ~${estimatedCost.toFixed(4)} pollen per request, but this key has ${Math.max(0, apiKeyBudget).toFixed(4)}.`,
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    if (!canCoverEstimatedCharge(userBalance, estimatedCost, isPaidOnly)) {
        const available = isPaidOnly
            ? userBalance.packBalance
            : Math.max(userBalance.tierBalance, userBalance.packBalance);
        throw new HTTPException(402, {
            message: `Insufficient balance. This model costs ~${estimatedCost.toFixed(4)} pollen per request, but your available balance is ${Math.max(0, available).toFixed(4)}.`,
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
    vars.auth.requireKeyBudget();
    await checkBalance(vars, env);
}

export const generationAccess = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await requireGenerationAccess(c.var, c.env);
        await next();
    },
);
