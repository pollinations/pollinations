import { getLogger } from "@logtape/logtape";
import type { ServiceId } from "@shared/registry/registry.ts";
import { getServiceDefinition } from "@shared/registry/registry.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "@/db/schema/better-auth.ts";
import {
    atomicDeductApiKeyBalance,
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    calculateDeductionSplit,
    getUserBalances,
} from "./balance-deduction.ts";

const log = getLogger(["track", "helpers"]);

interface DeductionParams {
    db: DrizzleD1Database;
    isBilledUsage: boolean;
    totalPrice?: number;
    userId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
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
        modelResolved,
    } = params;

    if (!isBilledUsage || !totalPrice) return;

    // Handle API key budget deduction
    if (apiKeyId && hasApiKeyBudget(apiKeyPollenBalance)) {
        await deductApiKeyBalance(db, apiKeyId, totalPrice);
    }

    // Handle user balance deduction
    if (userId) {
        await deductUserBalance(db, userId, totalPrice, modelResolved);
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
        await atomicDeductApiKeyBalance(db, apikeyTable, apiKeyId, amount);
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
): Promise<void> {
    try {
        const isPaidOnly = modelResolved
            ? (getServiceDefinition(modelResolved as ServiceId).paidOnly ??
              false)
            : false;

        if (isPaidOnly) {
            await atomicDeductPaidBalance(db, userId, amount);
            log.debug(
                "Decremented {price} pollen from user {userId} (paid-only model, tier excluded)",
                { price: amount, userId },
            );
            return;
        }

        // Regular deduction flow
        const balancesBefore = await getUserBalances(db, userId);
        const deductionSplit = calculateDeductionSplit(
            balancesBefore.tierBalance,
            balancesBefore.cryptoBalance,
            balancesBefore.packBalance,
            amount,
        );

        await atomicDeductUserBalance(db, userId, amount);

        log.debug(
            "Decremented {price} pollen from user {userId} (tier: -{fromTier}, crypto: -{fromCrypto}, pack: -{fromPack})",
            {
                price: amount,
                userId,
                ...deductionSplit,
            },
        );
    } catch (error) {
        log.error("Failed to decrement user balance for {userId}: {error}", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
