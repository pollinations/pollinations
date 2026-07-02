import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import type { BalanceBucket, UserBalance } from "./bucket-selection.ts";
import { toMicroPollen } from "./pollenMath.ts";

export type Bucket = BalanceBucket;

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

/**
 * Atomically deducts pollen from user balance using exact micro-unit math to prevent float drift.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    isPaidOnly = false,
): Promise<{ ok: boolean; bucket: Bucket | null; packBalance: number | null }> {
    if (amount <= 0) return { ok: true, bucket: null, packBalance: null };

    // Keep microAmount as a pure BigInt for SQL binding
    const microAmount = toMicroPollen(amount);

    const row = await db.get<{ bucket: Bucket; packBalance: number | null }>(
        sql`
        WITH decision AS MATERIALIZED (
            SELECT
                id,
                CASE
                    WHEN ${isPaidOnly ? 1 : 0} = 1 THEN 'pack'
                    /* Compare using precise micro-units */
                    WHEN (ROUND(COALESCE(tier_balance, 0) * 1000000)) >= ${microAmount} THEN 'tier'
                    WHEN (ROUND(COALESCE(pack_balance, 0) * 1000000)) > 0 THEN 'pack'
                    ELSE 'tier'
                END AS bucket
            FROM ${userTable}
            WHERE id = ${userId}
        )
        UPDATE ${userTable}
        SET
            tier_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'tier'
                    /* Convert to micro-units, deduct, convert back safely */
                    THEN (ROUND(COALESCE(tier_balance, 0) * 1000000) - ${microAmount}) / 1000000.0
                ELSE tier_balance
            END,
            pack_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'pack'
                    /* Convert to micro-units, deduct, convert back safely */
                    THEN (ROUND(COALESCE(pack_balance, 0) * 1000000) - ${microAmount}) / 1000000.0
                ELSE pack_balance
            END
        WHERE id = (SELECT id FROM decision)
        RETURNING
            (SELECT bucket FROM decision) AS bucket,
            pack_balance AS packBalance
    `,
    );

    return {
        ok: !!row,
        bucket: row?.bucket ?? null,
        packBalance: row?.packBalance ?? null,
    };
}

/**
 * Atomically deducts pollen from API key balance using precise micro-unit math.
 */
export async function atomicDeductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<{ ok: boolean }> {
    if (amount <= 0) return { ok: true };

    const microAmount = toMicroPollen(amount);

    const result = await db.run(sql`
			UPDATE ${apiKeyTable}
			SET pollen_balance = (ROUND(pollen_balance * 1000000) - ${microAmount}) / 1000000.0
			WHERE id = ${apiKeyId}
			AND pollen_balance IS NOT NULL
		`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}

export type { UserBalance };

/**
 * Atomically credits a positive amount to a user balance bucket using exact micro-unit math.
 */
export async function atomicCreditUserBalance(
    db: DrizzleD1Database,
    userId: string,
    bucket: Bucket,
    amount: number,
): Promise<{ ok: boolean; newBalance: number | null }> {
    if (amount <= 0) return { ok: true, newBalance: null };

    const column = BUCKET_COLUMNS[bucket];
    const microAmount = toMicroPollen(amount);

    const rows = await db
        .update(userTable)
        .set({
            [`${bucket}Balance`]: sql`(ROUND(COALESCE(${column}, 0) * 1000000) + ${microAmount}) / 1000000.0`,
        })
        .where(sql`${userTable.id} = ${userId}`)
        .returning({ newBalance: column });

    return {
        ok: rows.length > 0,
        newBalance: rows[0]?.newBalance ?? null,
    };
}
