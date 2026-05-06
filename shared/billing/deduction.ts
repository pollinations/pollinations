import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import type { BalanceBucket, UserBalance } from "./bucket-selection.ts";

export type Bucket = BalanceBucket;

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

/**
 * Atomically deducts pollen from user balance.
 *
 * Regular requests are binary: tier pays when it can cover the actual charge,
 * pack pays when tier cannot cover and pack is positive, and regular overage
 * falls back to tier when pack is empty.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<{ ok: boolean; bucket: Bucket | null }> {
    if (amount <= 0) return { ok: true, bucket: null };

    const row = await db.get<{ bucket: Bucket }>(sql`
        WITH decision AS MATERIALIZED (
            SELECT
                id,
                CASE
                    WHEN COALESCE(tier_balance, 0) >= ${amount} THEN 'tier'
                    WHEN COALESCE(pack_balance, 0) > 0 THEN 'pack'
                    ELSE 'tier'
                END AS bucket
            FROM ${userTable}
            WHERE id = ${userId}
        )
        UPDATE ${userTable}
        SET
            tier_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'tier'
                    THEN COALESCE(tier_balance, 0) - ${amount}
                ELSE tier_balance
            END,
            pack_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'pack'
                    THEN COALESCE(pack_balance, 0) - ${amount}
                ELSE pack_balance
            END
        WHERE id = (SELECT id FROM decision)
        RETURNING (SELECT bucket FROM decision) AS bucket
    `);

    return { ok: !!row, bucket: row?.bucket ?? null };
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
    const rows = await db
        .update(userTable)
        .set({ [`${bucket}Balance`]: sql`COALESCE(${column}, 0) + ${amount}` })
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
 * @returns Object with tier and pack balances
 */
export async function getUserBalances(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
    const result = await db
        .select({
            tierBalance: userTable.tierBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    const user = result[0];
    return {
        tierBalance: user?.tierBalance ?? 0,
        packBalance: user?.packBalance ?? 0,
    };
}

/**
 * Atomically deducts pollen from paid balance only (excluding tier_balance).
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
): Promise<{ ok: boolean; bucket: "pack" | null }> {
    if (amount <= 0) return { ok: true, bucket: null };

    const result = await db.run(sql`
			UPDATE ${userTable}
			SET pack_balance = COALESCE(pack_balance, 0) - ${amount}
			WHERE id = ${userId}
		`);

    const ok = (result.meta.changes ?? 0) > 0;
    return { ok, bucket: ok ? "pack" : null };
}
