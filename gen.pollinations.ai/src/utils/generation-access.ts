import { resolveModelPollenType } from "@shared/auth/api-key.ts";
import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { withByopMarkup } from "@shared/billing/markup.ts";
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
    // Resolve effective pollen type with precedence:
    // 1. paidOnly models always use pack (ignore everything else)
    // 2. questPollenOnly key + quest model → force "quest"
    // 3. Per-model override from permissions.models
    // 4. Key-level pollenType restriction
    const keyPollenType = auth.apiKey?.pollenType ?? null;
    const questPollenOnly = auth.apiKey?.questPollenOnly ?? false;
    let effectivePollenType: "quest" | "paid" | null;
    if (isPaidOnly) {
        effectivePollenType = null; // paidOnly models always use pack
    } else if (questPollenOnly) {
        effectivePollenType = "quest"; // questPollenOnly forces quest for quest models
    } else {
        effectivePollenType = resolveModelPollenType(
            auth.apiKey?.permissions,
            model.resolved,
            keyPollenType,
        );
    }
    const estimatedCost = withByopMarkup(
        getEstimatedPrice(
            await getModelStats(env.KV, log),
            model.resolved,
            model.definition,
        ),
        Boolean(auth.apiKey?.byopMarkupApplies),
    );
    const apiKeyBudget = auth.apiKey?.pollenBalance;
    const requiredBudget = Math.max(0, estimatedCost);
    if (typeof apiKeyBudget === "number" && apiKeyBudget < requiredBudget) {
        throw new HTTPException(402, {
            message: `API key budget too low. This request costs ~${estimatedCost.toFixed(4)} pollen, but this key has ${Math.max(0, apiKeyBudget).toFixed(4)}.`,
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    if (
        !canCoverEstimatedCharge(
            userBalance,
            estimatedCost,
            isPaidOnly,
            effectivePollenType,
        )
    ) {
        const available =
            effectivePollenType === "quest"
                ? userBalance.tierBalance
                : effectivePollenType === "paid"
                  ? userBalance.packBalance
                  : isPaidOnly
                    ? userBalance.packBalance
                    : Math.max(
                          userBalance.tierBalance,
                          userBalance.packBalance,
                      );
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
    vars.auth.requireUser();
    vars.auth.requireModelAccess();
    await checkBalance(vars, env);
}

export const generationAccess = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await requireGenerationAccess(c.var, c.env);
        await next();
    },
);
