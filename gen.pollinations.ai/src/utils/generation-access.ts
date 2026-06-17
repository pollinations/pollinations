import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";

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
    _env: CloudflareBindings,
): Promise<void> {
    const { auth, balance, model } = vars;
    if (!auth.user?.id) return;

    const serviceDefinition = getModelDefinition(model.resolved);
    const isPaidOnly = serviceDefinition.paidOnly ?? false;

    const apiKeyBudget = auth.apiKey?.pollenBalance;
    if (typeof apiKeyBudget === "number" && apiKeyBudget <= 0) {
        throw new HTTPException(402, {
            message: "API key budget too low.",
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    // No estimate, no negative prevention: any positive balance allows the
    // request. Paid-only models can only draw on the paid pack balance.
    if (isPaidOnly) {
        if (userBalance.packBalance <= 0) {
            throw new HTTPException(402, {
                message:
                    "This model requires 💳 paid balance. 🌱 Tier balance cannot be used.",
            });
        }
    } else if (userBalance.tierBalance <= 0 && userBalance.packBalance <= 0) {
        throw new HTTPException(402, {
            message: "Your pollen balance is too low.",
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
