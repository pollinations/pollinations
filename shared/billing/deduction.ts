import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import type { BalanceBucket, UserBalance } from "./bucket-selection.ts";

export type Bucket = BalanceBucket;

const BUCKET_COLUMNS = {
    reward: userTable.tierBalance,
    paid: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

const BUCKET_STORAGE_FIELDS = {
    reward: "tierBalance",
    paid: "packBalance",
} as const satisfies Record<Bucket, "tierBalance" | "packBalance">;

/**
 * Atomically deducts pollen from user balance.
 *
 * Regular requests are binary: reward pays when it can cover the actual charge,
 * paid pays when reward cannot cover and paid is positive, and regular overage
 * falls back to reward when paid is empty.
 * Paid-only requests always deduct from paid and never touch reward.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    isPaidOnly = false,
): Promise<{ ok: boolean; bucket: Bucket | null; paidBalance: number | null }> {
    if (amount <= 0) return { ok: true, bucket: null, paidBalance: null };

    const row = await db.get<{ bucket: Bucket; paidBalance: number | null }>(
        sql`
        WITH decision AS MATERIALIZED (
            SELECT
                id,
                CASE
                    WHEN ${isPaidOnly ? 1 : 0} = 1 THEN 'paid'
                    WHEN COALESCE(tier_balance, 0) >= ${amount} THEN 'reward'
                    WHEN COALESCE(pack_balance, 0) > 0 THEN 'paid'
                    ELSE 'reward'
                END AS bucket
            FROM ${userTable}
            WHERE id = ${userId}
        )
        UPDATE ${userTable}
        SET
            tier_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'reward'
                    THEN COALESCE(tier_balance, 0) - ${amount}
                ELSE tier_balance
            END,
            pack_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'paid'
                    THEN COALESCE(pack_balance, 0) - ${amount}
                ELSE pack_balance
            END
        WHERE id = (SELECT id FROM decision)
        RETURNING
            (SELECT bucket FROM decision) AS bucket,
            pack_balance AS paidBalance
    `,
    );

    return {
        ok: !!row,
        bucket: row?.bucket ?? null,
        paidBalance: row?.paidBalance ?? null,
    };
}

/**
 * Atomically deducts pollen from API key balance.
 * The `AND pollen_balance IS NOT NULL` guard means keys with NULL balance
 * (= unlimited budget) are never touched — no COALESCE needed here.
 *
 * @param db - Drizzle database instance
 * @param apiKeyTable - API key table
 * @param apiKeyId - API key ID to deduct from
 * @param amount - Amount of pollen to deduct
 * @returns Promise that resolves when deduction is complete
 */
export async function atomicDeductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<{ ok: boolean }> {
    if (amount <= 0) return { ok: true };

    const result = await db.run(sql`
			UPDATE ${apiKeyTable}
			SET pollen_balance = pollen_balance - ${amount}
			WHERE id = ${apiKeyId}
			AND pollen_balance IS NOT NULL
		`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}

export type { UserBalance };

/**
 * Atomically adjusts any user balance bucket by a positive or negative amount.
 */
export async function atomicAdjustUserBalance(
    db: DrizzleD1Database,
    userId: string,
    bucket: Bucket,
    amount: number,
): Promise<{ ok: boolean; newBalance: number | null }> {
    if (amount === 0) return { ok: true, newBalance: null };

    const column = BUCKET_COLUMNS[bucket];
    const storageField = BUCKET_STORAGE_FIELDS[bucket];
    const rows = await db
        .update(userTable)
        .set({ [storageField]: sql`COALESCE(${column}, 0) + ${amount}` })
        .where(sql`${userTable.id} = ${userId}`)
        .returning({ newBalance: column });

    return {
        ok: rows.length > 0,
        newBalance: rows[0]?.newBalance ?? null,
    };
}

export async function atomicCreditUserBalance(
    db: DrizzleD1Database,
    userId: string,
    bucket: Bucket,
    amount: number,
): Promise<{ ok: boolean; newBalance: number | null }> {
    if (amount <= 0) return { ok: true, newBalance: null };
    return atomicAdjustUserBalance(db, userId, bucket, amount);
}

/**
 * Gets the current balances for a user.
 * Useful for logging or displaying balance information.
 *
 * @param db - Drizzle database instance
 * @param userId - User ID to get balances for
 * @returns Object with reward and paid balances
 */
export async function getUserBalances(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
    const result = await db
        .select({
            rewardBalance: userTable.tierBalance,
            paidBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    const user = result[0];
    return {
        rewardBalance: user?.rewardBalance ?? 0,
        paidBalance: user?.paidBalance ?? 0,
    };
}
