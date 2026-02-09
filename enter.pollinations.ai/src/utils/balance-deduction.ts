import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/schema/better-auth.ts";

/**
 * Atomically deducts pollen from a single user balance bucket.
 * Picks the first bucket with balance > 0 in order: tier → crypto → pack.
 * The full amount is deducted from that one bucket (which may go negative).
 * No splitting across buckets — simpler accounting and tier negatives auto-reset daily.
 *
 * @param db - Drizzle database instance
 * @param userId - User ID to deduct from
 * @param amount - Amount of pollen to deduct
 * @returns Promise that resolves when deduction is complete
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

    // Deduct entire amount from the first positive bucket (tier → crypto → pack).
    // CASE picks exactly one column to deduct from; others stay untouched.
    // COALESCE on both conditions AND subtraction operands guards against NULL columns.
    // Note: the balance check (requirePositiveBalance) runs before the request, but by the
    // time this UPDATE runs the selected bucket may have changed due to concurrent requests.
    // The deduction itself is always correct; only the logged meter source may mismatch.
    await db.run(sql`
		UPDATE ${userTable}
		SET
			tier_balance = CASE
				WHEN COALESCE(tier_balance, 0) > 0 THEN COALESCE(tier_balance, 0) - ${amount}
				ELSE tier_balance
			END,
			crypto_balance = CASE
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(crypto_balance, 0) > 0 THEN COALESCE(crypto_balance, 0) - ${amount}
				ELSE crypto_balance
			END,
			pack_balance = CASE
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(crypto_balance, 0) <= 0 THEN COALESCE(pack_balance, 0) - ${amount}
				ELSE pack_balance
			END
		WHERE id = ${userId}
	`);
}

/**
 * Atomically deducts pollen from API key balance.
 *
 * @param db - Drizzle database instance
 * @param apiKeyTable - API key table
 * @param apiKeyId - API key ID to deduct from
 * @param amount - Amount of pollen to deduct
 * @returns Promise that resolves when deduction is complete
 */
export async function atomicDeductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyTable: any,
    apiKeyId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

    await db.run(sql`
		UPDATE ${apiKeyTable}
		SET pollen_balance = pollen_balance - ${amount}
		WHERE id = ${apiKeyId}
		AND pollen_balance IS NOT NULL
	`);
}

export type UserBalances = {
    tierBalance: number;
    cryptoBalance: number;
    packBalance: number;
};

/**
 * Gets the current balances for a user.
 * Useful for logging or displaying balance information.
 *
 * @param db - Drizzle database instance
 * @param userId - User ID to get balances for
 * @returns Object with tier, crypto, and pack balances
 */
export async function getUserBalances(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalances> {
    const result = await db
        .select({
            tierBalance: userTable.tierBalance,
            cryptoBalance: userTable.cryptoBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    const user = result[0];
    return {
        tierBalance: user?.tierBalance ?? 0,
        cryptoBalance: user?.cryptoBalance ?? 0,
        packBalance: user?.packBalance ?? 0,
    };
}

export type DeductionSplit = {
    fromTier: number;
    fromCrypto: number;
    fromPack: number;
};

/**
 * Calculates which single balance bucket a deduction comes from.
 * Picks the first bucket with balance > 0 (tier → crypto → pack).
 * The full amount is attributed to that one bucket.
 *
 * @param tierBalance - Current tier balance
 * @param cryptoBalance - Current crypto balance
 * @param amount - Amount to deduct
 * @returns Object showing which balance type the deduction comes from
 */
export function calculateDeductionSplit(
    tierBalance: number,
    cryptoBalance: number,
    amount: number,
): DeductionSplit {
    if (tierBalance > 0)
        return { fromTier: amount, fromCrypto: 0, fromPack: 0 };
    if (cryptoBalance > 0)
        return { fromTier: 0, fromCrypto: amount, fromPack: 0 };
    return { fromTier: 0, fromCrypto: 0, fromPack: amount };
}

/**
 * Atomically deducts pollen from paid balances only (excluding tier_balance).
 * Picks the first positive bucket: crypto → pack. Full amount from one bucket.
 *
 * @param db - Drizzle database instance
 * @param userId - User ID to deduct from
 * @param amount - Amount of pollen to deduct
 * @returns Promise that resolves when deduction is complete
 */
export async function atomicDeductPaidBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

    // Deduct entire amount from first positive paid bucket (crypto → pack)
    // COALESCE guards against NULL columns in both conditions and subtraction
    await db.run(sql`
		UPDATE ${userTable}
		SET
			crypto_balance = CASE
				WHEN COALESCE(crypto_balance, 0) > 0 THEN COALESCE(crypto_balance, 0) - ${amount}
				ELSE crypto_balance
			END,
			pack_balance = CASE
				WHEN COALESCE(crypto_balance, 0) <= 0 THEN COALESCE(pack_balance, 0) - ${amount}
				ELSE pack_balance
			END
		WHERE id = ${userId}
	`);
}
