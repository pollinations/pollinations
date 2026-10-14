import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import {
    atomicAdjustApiKeyBalance,
    atomicReserveApiKeyBalance,
} from "@shared/billing/deduction.ts";
import { getFundedUserBalance } from "@shared/billing/internal-automation.ts";
import { withByopMarkup } from "@shared/billing/markup.ts";
import { getModelStats } from "@shared/utils/model-stats.ts";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { getEstimatedPrice } from "@/utils/model-stats.ts";
import { keyBudgetExhausted, requireFunds } from "@/utils/refusals.ts";

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

    const isPaidOnly = model.definition.paidOnly;
    const estimatedCost = withByopMarkup(
        getEstimatedPrice(
            await getModelStats(env.KV, log),
            model.resolved,
            model.definition,
        ),
        Boolean(auth.apiKey?.byopMarkupApplies),
    );
    const userId = auth.user.id;
    const userBalance = await requireFunds(
        { var: vars, env },
        estimatedCost,
        () => balance.getBalance(userId),
        isPaidOnly,
    );

    balance.balanceCheckResult = createBalanceCheckResult(
        userBalance,
        isPaidOnly,
    );
    if (typeof auth.apiKey?.pollenBalance === "number") {
        balance.apiKeyBudgetEstimate = Math.max(0, estimatedCost);
    }
}

/**
 * Wallet and key budget preflight for charges known before execution
 * (sandbox leases) or only after it (MCP tool receipts, price 0).
 */
export async function requireAccountFunds(
    c: Context<Env>,
    price: number,
): Promise<void> {
    const userId = c.var.auth.requireUser().id;
    await requireFunds(c, price, () =>
        getFundedUserBalance(drizzle(c.env.DB), c.env.DB, userId),
    );
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
        throw keyBudgetExhausted(
            { var: vars, env },
            "API key budget was exhausted by another request; try again once it settles.",
        );
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
