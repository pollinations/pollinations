import { getLogger } from "@logtape/logtape";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "@/db/schema/better-auth.ts";
import {
    atomicDeductApiKeyBalance,
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
}

/**
 * Handles balance deduction for both API keys and users after billable requests
 */
export async function handleBalanceDeduction({
    db,
    isBilledUsage,
    totalPrice,
    userId,
    apiKeyId,
    apiKeyPollenBalance,
}: DeductionParams): Promise<void> {
    if (!isBilledUsage || !totalPrice) return;

    // Handle API key budget deduction
    if (
        apiKeyId &&
        apiKeyPollenBalance !== null &&
        apiKeyPollenBalance !== undefined
    ) {
        try {
            await atomicDeductApiKeyBalance(
                db,
                apikeyTable,
                apiKeyId,
                totalPrice,
            );
            log.debug(
                "Decremented {price} pollen from API key {keyId} budget",
                {
                    price: totalPrice,
                    keyId: apiKeyId,
                },
            );
        } catch (error) {
            log.error(
                "Failed to decrement API key budget for {keyId}: {error}",
                {
                    keyId: apiKeyId,
                    error: error instanceof Error ? error.message : error,
                },
            );
        }
    }

    // Handle user balance deduction
    if (userId) {
        try {
            const balancesBefore = await getUserBalances(db, userId);
            const deductionSplit = calculateDeductionSplit(
                balancesBefore.tierBalance,
                balancesBefore.cryptoBalance,
                balancesBefore.packBalance,
                totalPrice,
            );

            await atomicDeductUserBalance(db, userId, totalPrice);

            log.debug(
                "Decremented {price} pollen from user {userId} (tier: -{fromTier}, crypto: -{fromCrypto}, pack: -{fromPack})",
                {
                    price: totalPrice,
                    userId,
                    fromTier: deductionSplit.fromTier,
                    fromCrypto: deductionSplit.fromCrypto,
                    fromPack: deductionSplit.fromPack,
                },
            );
        } catch (error) {
            log.error(
                "Failed to decrement user balance for {userId}: {error}",
                {
                    userId,
                    error: error instanceof Error ? error.message : error,
                },
            );
        }
    }
}
