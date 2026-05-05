import {
    createBalanceCheckResult,
    getAvailableBalanceForCharge,
} from "@shared/billing/balance.ts";
import { resolveDevMarkup } from "@shared/billing/track-helpers.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { drizzle } from "drizzle-orm/d1";
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

    const markup = await resolveDevMarkup(
        drizzle(env.DB),
        auth.apiKey?.byopClientKeyId,
        estimatedCost,
        auth.user.id,
    );
    const estimatedBillingPrice = estimatedCost + (markup?.devCredit ?? 0);

    if (estimatedCost > 0) {
        const apiKeyBudget = auth.apiKey?.pollenBalance;
        if (
            typeof apiKeyBudget === "number" &&
            apiKeyBudget < estimatedBillingPrice
        ) {
            throw new HTTPException(402, {
                message: `API key budget too low. This model costs ~${estimatedBillingPrice.toFixed(4)} pollen per request, but this key has ${apiKeyBudget.toFixed(4)} remaining.`,
            });
        }

        const userBalance = await balance.getBalance(auth.user.id);
        const available = getAvailableBalanceForCharge(
            userBalance,
            estimatedBillingPrice,
            isPaidOnly,
        );

        if (available < estimatedBillingPrice) {
            throw new HTTPException(402, {
                message: `Insufficient balance. This model costs ~${estimatedBillingPrice.toFixed(4)} pollen per request, but your available balance is ${available.toFixed(4)}.`,
            });
        }
    }

    if (isPaidOnly) {
        await balance.requirePaidBalance(
            auth.user.id,
            "This model requires 💳 paid balance. 🌱 Tier balance cannot be used.",
        );
        balance.balanceCheckResult = createBalanceCheckResult(
            await balance.getBalance(auth.user.id),
            true,
            estimatedBillingPrice,
        );
        return;
    }

    await balance.requirePositiveBalance(
        auth.user.id,
        "Insufficient pollen balance to use this model",
    );
    balance.balanceCheckResult = createBalanceCheckResult(
        await balance.getBalance(auth.user.id),
        false,
        estimatedBillingPrice,
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
