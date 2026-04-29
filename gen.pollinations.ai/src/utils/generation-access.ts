import { getAvailableBalance } from "@shared/billing/balance.ts";
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
    let estimatedCost = getEstimatedPrice(stats, model.resolved);

    if (estimatedCost > 5) {
        log.warn(
            "Estimated cost for {model} is suspiciously high ({cost}). Capping to 2.0",
            {
                model: model.resolved,
                cost: estimatedCost,
            },
        );
        estimatedCost = 2.0;
    }

    if (estimatedCost > 0) {
        const userBalance = await balance.getBalance(auth.user.id);
        const available = getAvailableBalance(userBalance, isPaidOnly);

        if (available < estimatedCost) {
            throw new HTTPException(402, {
                message: `Insufficient balance. This model costs ~${estimatedCost.toFixed(4)} pollen per request, but your available balance is ${available.toFixed(4)}.`,
            });
        }
    }

    if (isPaidOnly) {
        await balance.requirePaidBalance(
            auth.user.id,
            "This model requires a paid balance. Tier balance cannot be used.",
        );
        return;
    }

    await balance.requirePositiveBalance(
        auth.user.id,
        "Insufficient pollen balance to use this model",
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
