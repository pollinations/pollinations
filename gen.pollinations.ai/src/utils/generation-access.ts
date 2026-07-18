import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
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

    // Org-owned keys always spend the organization's balance, never the
    // creating member's — and organizations are paid-only (no quest/tier
    // bucket), so this is a fully separate branch rather than a variant of
    // the user-balance check below.
    const organizationId = auth.apiKey?.organizationId;
    if (organizationId) {
        const orgBalance = await balance.getOrganizationBalance(organizationId);
        const orgUserBalance = {
            tierBalance: 0,
            packBalance: orgBalance.packBalance,
        };
        if (
            !isFreeCommunityModel &&
            !canCoverEstimatedCharge(orgUserBalance, estimatedCost, true)
        ) {
            throw new HTTPException(402, {
                message: `Organization balance too low. This request costs ~${estimatedCost.toFixed(4)} pollen, but the organization's available balance is ${Math.max(0, orgBalance.packBalance).toFixed(4)}.`,
            });
        }
        balance.balanceCheckResult = createBalanceCheckResult(
            orgUserBalance,
            true,
        );
        return;
    }

    const isPaidOnly = model.definition.paidOnly ?? false;
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
