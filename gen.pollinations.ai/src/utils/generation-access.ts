import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { computeDevCredit } from "@shared/billing/markup.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
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
    const communityEndpoint = model.communityEndpoint;
    const isFreeCommunityModel =
        communityEndpoint !== undefined &&
        COMMUNITY_ENDPOINT_PRICE_FIELDS.every(
            (field) => communityEndpoint[field.key] === 0,
        );

    const apiKeyBudget = auth.apiKey?.pollenBalance;
    const estimatedPayerCharge = roundPollenLedgerAmount(
        estimatedCost +
            (auth.apiKey?.creatorEarningsEnabled
                ? computeDevCredit(estimatedCost)
                : 0),
    );
    const requiredBudget = Math.max(0, estimatedPayerCharge);
    // API-key budgets are soft limits: this estimate gates a new request, while
    // settlement charges actual usage and clamps any one-request overrun to 0.
    if (
        !isFreeCommunityModel &&
        typeof apiKeyBudget === "number" &&
        apiKeyBudget <= requiredBudget
    ) {
        throw new HTTPException(402, {
            message: `API key budget too low. This request costs ~${estimatedPayerCharge.toFixed(4)} pollen, but this key has ${Math.max(0, apiKeyBudget).toFixed(4)}.`,
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    if (
        !isFreeCommunityModel &&
        !canCoverEstimatedCharge(userBalance, estimatedPayerCharge, isPaidOnly)
    ) {
        const available = isPaidOnly
            ? userBalance.packBalance
            : Math.max(userBalance.tierBalance, userBalance.packBalance);
        throw new HTTPException(402, {
            message: `Insufficient balance. This request costs ~${estimatedPayerCharge.toFixed(4)} pollen, but your available balance is ${Math.max(0, available).toFixed(4)}.`,
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
