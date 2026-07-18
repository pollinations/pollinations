import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/better-auth.ts";
import type { BalanceBucket, UserBalance } from "./bucket-selection.ts";

export type Bucket = BalanceBucket;

/**
 * Atomically deducts pollen from user balance.
 *
 * Regular requests are binary: Quest Pollen pays when it can cover the actual
 * charge, pack pays when Quest Pollen cannot cover and pack is positive, and
 * regular overage falls back to Quest Pollen when pack is empty.
 * Paid-only requests always deduct from pack and never touch Quest Pollen.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    isPaidOnly = false,
): Promise<{ ok: boolean; bucket: Bucket | null; packBalance: number | null }> {
    if (amount <= 0) return { ok: true, bucket: null, packBalance: null };

    const row = await db.get<{ bucket: Bucket; packBalance: number | null }>(
        sql`
        WITH decision AS MATERIALIZED (
            SELECT
                id,
                CASE
                    WHEN ${isPaidOnly ? 1 : 0} = 1 THEN 'pack'
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

export type { UserBalance };
