import { getLogger } from "@logtape/logtape";
import type { ServiceId } from "@shared/registry/registry.ts";
import { getServiceDefinition } from "@shared/registry/registry.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    DEFAULT_SPEND_POLICY,
    type SpendPolicy,
} from "@/utils/spend-policy.ts";
import {
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductTierBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
} from "./balance-deduction.ts";

const log = getLogger(["track", "helpers"]);

interface DeductionParams {
    db: DrizzleD1Database;
    isBilledUsage: boolean;
    totalPrice?: number;
    userId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
    spendPolicy?: SpendPolicy;
    modelResolved?: string;
}

/**
 * Handles balance deduction for both API keys and users after billable requests
 */
export async function handleBalanceDeduction(
    params: DeductionParams,
): Promise<void> {
    const {
        db,
        isBilledUsage,
        totalPrice,
        userId,
        apiKeyId,
        apiKeyPollenBalance,
        spendPolicy,
        modelResolved,
    } = params;

    if (!isBilledUsage || !totalPrice) return;

    // Handle API key budget deduction
    if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
        await deductApiKeyBalance(db, apiKeyId, totalPrice);
    }

    // Handle user balance deduction
    if (userId) {
        await deductUserBalance(
            db,
            userId,
            totalPrice,
            modelResolved,
            spendPolicy,
        );
    }
}

function hasApiKeyBudget(
    balance: number | null | undefined,
): balance is number {
    return typeof balance === "number";
}

async function deductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<void> {
    try {
        await atomicDeductApiKeyBalance(db, apiKeyId, amount);
        log.debug("Decremented {price} pollen from API key {keyId} budget", {
            price: amount,
            keyId: apiKeyId,
        });
    } catch (error) {
        log.error("Failed to decrement API key budget for {keyId}: {error}", {
            keyId: apiKeyId,
            error: error instanceof Error ? error.message : error,
        });
    }
}

async function deductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    modelResolved?: string,
    spendPolicy = DEFAULT_SPEND_POLICY,
): Promise<void> {
    try {
        const isPaidOnly = modelResolved
            ? (getServiceDefinition(modelResolved as ServiceId).paidOnly ??
              false)
            : false;

        if (spendPolicy === "tier_only") {
            await atomicDeductTierBalance(db, userId, amount);
            log.debug(
                "Decremented {price} pollen from user {userId} (tier-only key)",
                { price: amount, userId },
            );
            return;
        }

        if (isPaidOnly || spendPolicy === "paid_only") {
            await atomicDeductPaidBalance(db, userId, amount);
            log.debug(
                "Decremented {price} pollen from user {userId} (paid balances only)",
                { price: amount, userId },
            );
            return;
        }

        // Regular deduction flow
        // Note: TOCTOU — balances may shift between this read and the UPDATE in
        // atomicDeductUserBalance due to concurrent requests.  The SQL CASE always
        // picks the correct bucket; only the logged split below may mismatch.
        const balancesBefore = await getUserBalances(db, userId);
        const deductionSource = identifyDeductionSource(
            balancesBefore.tierBalance,
            balancesBefore.cryptoBalance,
            amount,
            balancesBefore.packBalance,
        );

        await atomicDeductUserBalance(db, userId, amount);

        log.debug(
            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, crypto: -{fromCrypto}, pack: -{fromPack})",
            {
                price: amount,
                userId,
                ...deductionSource,
            },
        );
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
