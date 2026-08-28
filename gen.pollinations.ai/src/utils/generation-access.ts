import { resolveModelPollenType } from "@shared/auth/api-key.ts";
import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import {
    atomicAdjustApiKeyBalance,
    atomicReserveApiKeyBalance,
} from "@shared/billing/deduction.ts";
import { withByopMarkup } from "@shared/billing/markup.ts";
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
    const keyPollenType = auth.apiKey?.pollenType ?? null;
    // Resolve effective pollen type: per-model override > key-level restriction
    const effectivePollenType = isPaidOnly
        ? null // paidOnly models always use pack, ignore pollen type
        : resolveModelPollenType(
              auth.apiKey?.permissions,
              model.resolved,
              keyPollenType,
          );
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
        const available = isPaidOnly
            ? userBalance.packBalance
            : effectivePollenType === "quest"
              ? userBalance.tierBalance
              : effectivePollenType === "paid"
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
    if (typeof apiKeyBudget === "number") {
        balance.apiKeyBudgetEstimate = requiredBudget;
    }
}

export async function reserveApiKeyBudget(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    const apiKeyId = vars.auth.apiKey?.id;
    const amount = vars.balance.apiKeyBudgetEstimate;
    if (!apiKeyId || amount === undefined) return;

    const db = drizzle(env.DB);
    const reservation = await atomicReserveApiKeyBalance(db, apiKeyId, amount);
    if (!reservation.ok) {
        throw new HTTPException(402, {
            message:
                "API key budget was exhausted by another request. Increase the key budget or try again after the other request settles.",
        });
    }
    vars.balance.apiKeyReservation = {
        apiKeyId,
        amount: reservation.reserved,
    };
}

export async function releaseApiKeyBudgetReservation(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
): Promise<void> {
    const reservation = vars.balance.apiKeyReservation;
    if (!reservation) return;

    const db = drizzle(env.DB);
    const { ok } = await atomicAdjustApiKeyBalance(
        db,
        reservation.apiKeyId,
        -reservation.amount,
    );
    if (!ok) {
        throw new Error(
            `API key budget release affected 0 rows for ${reservation.apiKeyId}`,
        );
    }
    vars.balance.apiKeyReservation = undefined;
}

export const apiKeyBudgetReservation = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        await reserveApiKeyBudget(c.var, c.env);
        try {
            await next();
        } catch (error) {
            await releaseApiKeyBudgetReservation(c.var, c.env);
            throw error;
        }
    },
);

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
