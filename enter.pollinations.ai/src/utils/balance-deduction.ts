import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/schema/better-auth.ts";

/**
 * Atomically deducts pollen from user balances in the correct order:
 * tier_balance → crypto_balance → pack_balance
 *
 * This function performs the deduction in a single atomic SQL statement to avoid
 * race conditions that could occur with concurrent requests.
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

    // This complex SQL statement atomically deducts from balances in order:
    // 1. First, deduct from tier_balance (up to available amount)
    // 2. Then, deduct remainder from crypto_balance (up to available amount)
    // 3. Finally, deduct any remaining from pack_balance (can go negative)
    //
    // The MAX(0, ...) ensures tier and crypto never go below 0
    // Pack balance is allowed to go negative as it represents paid credits
    // Note: SQLite uses MAX/MIN instead of GREATEST/LEAST
    await db.run(sql`
		UPDATE ${userTable}
		SET
			tier_balance = MAX(0, tier_balance - MIN(tier_balance, ${amount})),
			crypto_balance = MAX(0,
				crypto_balance - MIN(crypto_balance,
					MAX(0, ${amount} - COALESCE(tier_balance, 0))
				)
			),
			pack_balance = pack_balance - MAX(0,
				${amount} - COALESCE(tier_balance, 0) - COALESCE(crypto_balance, 0)
			)
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
): Promise<{
    tierBalance: number;
    cryptoBalance: number;
    packBalance: number;
}> {
    const result = await db
        .select({
            tierBalance: userTable.tierBalance,
            cryptoBalance: userTable.cryptoBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    return {
        tierBalance: result[0]?.tierBalance ?? 0,
        cryptoBalance: result[0]?.cryptoBalance ?? 0,
        packBalance: result[0]?.packBalance ?? 0,
    };
}

/**
 * Calculates how a deduction would be split across balance types.
 * This is useful for logging or preview purposes.
 *
 * @param tierBalance - Current tier balance
 * @param cryptoBalance - Current crypto balance
 * @param packBalance - Current pack balance
 * @param amount - Amount to deduct
 * @returns Object showing how much would be deducted from each balance type
 */
export function calculateDeductionSplit(
    tierBalance: number,
    cryptoBalance: number,
    packBalance: number,
    amount: number,
): {
    fromTier: number;
    fromCrypto: number;
    fromPack: number;
} {
    const fromTier = Math.min(amount, Math.max(0, tierBalance));
    const remainingAfterTier = amount - fromTier;
    const fromCrypto = Math.min(remainingAfterTier, Math.max(0, cryptoBalance));
    const fromPack = remainingAfterTier - fromCrypto;

    return { fromTier, fromCrypto, fromPack };
}
