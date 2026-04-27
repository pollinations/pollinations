import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/schema/better-auth.ts";

/**
 * Balance buckets, in the order they are consumed by atomicDeductUserBalance.
 *
 * - tier: free, hourly-refilled allowance per tier
 * - dev: earnings from BYOP markup on apps the user owns (spendable)
 * - pack: purchased via Stripe/Polar, cumulative
 */
export const BALANCE_BUCKETS = ["tier", "dev", "pack"] as const;
export type Bucket = (typeof BALANCE_BUCKETS)[number];

export type UserBalance = Record<`${Bucket}Balance`, number>;

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    dev: userTable.devBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

/**
 * Atomically deducts pollen from user balance.
 *
 * Priority when non-tier balance is positive: tier → dev → pack.
 * If no positive non-tier balance, always deducts from tier —
 * tier refills hourly so going negative is fine and prevents spillover into
 * non-tier buckets.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<{ ok: boolean }> {
    if (amount <= 0) return { ok: true };

    const result = await db.run(sql`
		UPDATE ${userTable}
		SET
			tier_balance = CASE
				WHEN (COALESCE(pack_balance, 0) + COALESCE(dev_balance, 0)) <= 0 THEN COALESCE(tier_balance, 0) - ${amount}
				WHEN COALESCE(tier_balance, 0) > 0 THEN COALESCE(tier_balance, 0) - ${amount}
				ELSE tier_balance
			END,
			dev_balance = CASE
				WHEN (COALESCE(pack_balance, 0) + COALESCE(dev_balance, 0)) <= 0 THEN dev_balance
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(dev_balance, 0) > 0 THEN COALESCE(dev_balance, 0) - ${amount}
				ELSE dev_balance
			END,
			pack_balance = CASE
				WHEN (COALESCE(pack_balance, 0) + COALESCE(dev_balance, 0)) <= 0 THEN pack_balance
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(dev_balance, 0) <= 0 THEN COALESCE(pack_balance, 0) - ${amount}
				ELSE pack_balance
			END
		WHERE id = ${userId}
	`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}

/**
 * Atomically deducts pollen from API key balance.
 * The `AND pollen_balance IS NOT NULL` guard means keys with NULL balance
 * (= unlimited budget) are never touched — no COALESCE needed here.
 */
export async function atomicDeductApiKeyBalance(
    db: DrizzleD1Database,
    apiKeyTable: any,
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

/**
 * Atomically adjusts any user balance bucket by a positive or negative amount.
 *
 * Returns { ok } — false means the user row was missing (UPDATE affected 0
 * rows). `newBalance` is the post-adjustment value when available. Throws on
 * D1 errors — the caller decides how to react.
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

/**
 * Atomically credits pollen to any user balance bucket.
 */
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
 */
export async function getUserBalances(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBalance> {
    const result = await db
        .select({
            tierBalance: userTable.tierBalance,
            devBalance: userTable.devBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    const user = result[0];
    return {
        tierBalance: user?.tierBalance ?? 0,
        devBalance: user?.devBalance ?? 0,
        packBalance: user?.packBalance ?? 0,
    };
}

export type DeductionSource = Record<`from${Capitalize<Bucket>}`, number>;

/**
 * Identifies which single balance bucket a deduction comes from.
 * Mirrors the CASE logic in atomicDeductUserBalance:
 * - If no positive non-tier balance → always tier
 * - Otherwise: tier → dev → pack
 */
export function identifyDeductionSource(
    balances: UserBalance,
    amount: number,
): DeductionSource {
    const zero: DeductionSource = {
        fromTier: 0,
        fromDev: 0,
        fromPack: 0,
    };
    const { tierBalance, devBalance, packBalance } = balances;

    if (devBalance + packBalance <= 0) return { ...zero, fromTier: amount };
    if (tierBalance > 0) return { ...zero, fromTier: amount };
    if (devBalance > 0) return { ...zero, fromDev: amount };
    return { ...zero, fromPack: amount };
}

/**
 * Atomically deducts pollen for paid-only models.
 * Paid-only models bill pack_balance only — dev_balance (BYOP earnings) and
 * tier_balance (free allowance) are not spendable on paid-only workloads.
 */
export async function atomicDeductPaidBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<{ ok: boolean }> {
    if (amount <= 0) return { ok: true };

    const result = await db.run(sql`
		UPDATE ${userTable}
		SET pack_balance = COALESCE(pack_balance, 0) - ${amount}
		WHERE id = ${userId}
	`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}
