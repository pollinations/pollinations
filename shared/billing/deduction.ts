import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import type {
    BalanceBucket,
    KeyPollenType,
    UserBalance,
} from "./bucket-selection.ts";
import { POLLEN_BILLING_PRECISION } from "./precision.ts";

export type Bucket = BalanceBucket;

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

/**
 * Atomically deducts pollen from user balance.
 *
 * This is the authoritative deduction ladder — the one place a positive charge
 * picks a bucket and money actually moves, read top-to-bottom as the `decision`
 * CASE below. `canCoverEstimatedCharge` answers the separate preflight question
 * of whether an estimate is affordable, while `createBalanceCheckResult` only
 * labels a meter for reporting. Neither is an authoritative write-path rule.
 *
<<<<<<< HEAD
 *   1. paid-only  → `pack` only (never Quest Pollen)
 *   2. tier       → Quest Pollen when it covers the full amount (`>=`)
 *   3. pack       → any positive paid balance when Quest Pollen can't cover
 *   4. tier       → fall back to Quest Pollen when pack is non-positive
 *
=======
>>>>>>> 3bace2907 (fix: correct pollen type precedence and add database migration)
 * When keyPollenType is set, it restricts deduction to the specified bucket
 * (but only for non-paidOnly models):
 * - "quest" → always deduct from tier_balance
 * - "paid" → always deduct from pack_balance
 *
 * The final `tier` fall-through is load-bearing: when Quest Pollen cannot cover
 * the charge and paid balance is non-positive, the charge accrues Quest-Pollen
 * debt instead of reducing paid balance further. Non-positive amounts return
 * without selecting a bucket or writing.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
    isPaidOnly = false,
    keyPollenType?: KeyPollenType | null,
): Promise<{
    ok: boolean;
    bucket: Bucket | null;
    packBalance: number | null;
    postDeductionBalance: number | null;
}> {
    if (amount <= 0) {
        return {
            ok: true,
            bucket: null,
            packBalance: null,
            postDeductionBalance: null,
        };
    }

    const row = await db.get<{
        bucket: Bucket;
        tierBalance: number | null;
        packBalance: number | null;
    }>(
        sql`
        WITH decision AS MATERIALIZED (
            SELECT
                id,
                CASE
                    WHEN ${isPaidOnly ? 1 : 0} = 1 THEN 'pack'
                    WHEN ${keyPollenType === "quest" ? 1 : 0} = 1 THEN 'tier'
                    WHEN ${keyPollenType === "paid" ? 1 : 0} = 1 THEN 'pack'
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
                    THEN ROUND(COALESCE(tier_balance, 0) - ${amount}, ${POLLEN_BILLING_PRECISION})
                ELSE tier_balance
            END,
            pack_balance = CASE
                WHEN (SELECT bucket FROM decision) = 'pack'
                    THEN ROUND(COALESCE(pack_balance, 0) - ${amount}, ${POLLEN_BILLING_PRECISION})
                ELSE pack_balance
            END
        WHERE id = (SELECT id FROM decision)
        RETURNING
            (SELECT bucket FROM decision) AS bucket,
            tier_balance AS tierBalance,
            pack_balance AS packBalance
    `,
    );

    return {
        ok: !!row,
        bucket: row?.bucket ?? null,
        packBalance: row?.packBalance ?? null,
        postDeductionBalance: row
            ? row.bucket === "tier"
                ? row.tierBalance
                : row.packBalance
            : null,
    };
}

/** Reserve an estimated charge from a finite API-key budget. */
export async function atomicReserveApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<{ ok: boolean; reserved: number }> {
    if (amount <= 0) return { ok: true, reserved: 0 };

    const result = await db.run(sql`
			UPDATE ${apiKeyTable}
			SET pollen_balance = ROUND(pollen_balance - ${amount}, ${POLLEN_BILLING_PRECISION})
			WHERE id = ${apiKeyId}
			AND pollen_balance IS NOT NULL
			AND pollen_balance >= ${amount}
		`);

    const ok = (result.meta.changes ?? 0) > 0;
    return { ok, reserved: ok ? amount : 0 };
}

/**
 * Reconcile a finite API-key budget with the final charge. Positive amounts
 * deduct more; negative amounts release unused reservation.
 */
export async function atomicAdjustApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyId: string,
    amount: number,
): Promise<{ ok: boolean }> {
    if (amount === 0) return { ok: true };

    const result = await db.run(sql`
			UPDATE ${apiKeyTable}
			SET pollen_balance = ROUND(pollen_balance - ${amount}, ${POLLEN_BILLING_PRECISION})
			WHERE id = ${apiKeyId}
			AND pollen_balance IS NOT NULL
		`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}

export type { UserBalance };

/**
 * Atomically credits a positive amount to a user balance bucket.
 */
export async function atomicCreditUserBalance(
    db: DrizzleD1Database,
    userId: string,
    bucket: Bucket,
    amount: number,
): Promise<{ ok: boolean; newBalance: number | null }> {
    if (amount <= 0) return { ok: true, newBalance: null };

    const column = BUCKET_COLUMNS[bucket];
    const rows = await db
        .update(userTable)
        .set({
            [`${bucket}Balance`]: sql`ROUND(COALESCE(${column}, 0) + ${amount}, ${POLLEN_BILLING_PRECISION})`,
        })
        .where(sql`${userTable.id} = ${userId}`)
        .returning({ newBalance: column });

    return {
        ok: rows.length > 0,
        newBalance: rows[0]?.newBalance ?? null,
    };
}
