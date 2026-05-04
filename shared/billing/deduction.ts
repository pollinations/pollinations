import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import type { UserBalance } from "./balance.ts";

export const BALANCE_BUCKETS = ["tier", "pack"] as const;
export type Bucket = (typeof BALANCE_BUCKETS)[number];

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

export const BILLING_POLICIES = {
    regular: {
        spendOrder: ["tier", "pack"],
        debtBucket: "tier",
    },
    paidOnly: {
        spendOrder: ["pack"],
        debtBucket: "pack",
    },
} as const satisfies Record<
    string,
    { spendOrder: readonly Bucket[]; debtBucket: Bucket }
>;

type BillingPolicy = (typeof BILLING_POLICIES)[keyof typeof BILLING_POLICIES];

/**
 * Atomically deducts pollen from user balance.
 *
 * Regular requests spend positive tier balance first, then positive pack
 * balance. Any remaining debt lands in tier balance because tier refills hourly.
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
				tier_balance = COALESCE(tier_balance, 0) - CASE
					WHEN ${amount} <= MAX(COALESCE(tier_balance, 0), 0) THEN ${amount}
					WHEN ${amount} <= MAX(COALESCE(tier_balance, 0), 0) + MAX(COALESCE(pack_balance, 0), 0)
						THEN MAX(COALESCE(tier_balance, 0), 0)
					ELSE ${amount} - MAX(COALESCE(pack_balance, 0), 0)
				END,
				pack_balance = COALESCE(pack_balance, 0) - CASE
					WHEN ${amount} <= MAX(COALESCE(tier_balance, 0), 0) THEN 0
					WHEN ${amount} <= MAX(COALESCE(tier_balance, 0), 0) + MAX(COALESCE(pack_balance, 0), 0)
						THEN ${amount} - MAX(COALESCE(tier_balance, 0), 0)
					ELSE MAX(COALESCE(pack_balance, 0), 0)
				END
			WHERE id = ${userId}
		`);

    return { ok: (result.meta.changes ?? 0) > 0 };
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

export type DeductionSource = Record<`from${Capitalize<Bucket>}`, number>;

/**
 * Identifies how a deduction will split across buckets under a policy.
 */
export function identifyDeductionSource(
    balances: UserBalance,
    amount: number,
    policy: BillingPolicy = BILLING_POLICIES.regular,
): DeductionSource {
    const zero: DeductionSource = {
        fromTier: 0,
        fromPack: 0,
    };
    if (amount <= 0) return zero;

    let remaining = amount;
    const source = { ...zero };
    for (const bucket of policy.spendOrder) {
        const available = Math.max(0, getBucketBalance(balances, bucket));
        const spent = Math.min(available, remaining);
        source[`from${capitalizeBucket(bucket)}`] += spent;
        remaining -= spent;
        if (remaining <= 0) return source;
    }

    source[`from${capitalizeBucket(policy.debtBucket)}`] += remaining;
    return source;
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
): Promise<{ ok: boolean }> {
    if (amount <= 0) return { ok: true };

    const result = await db.run(sql`
			UPDATE ${userTable}
			SET pack_balance = COALESCE(pack_balance, 0) - ${amount}
			WHERE id = ${userId}
		`);

    return { ok: (result.meta.changes ?? 0) > 0 };
}

function capitalizeBucket(bucket: Bucket): Capitalize<Bucket> {
    return (bucket[0].toUpperCase() + bucket.slice(1)) as Capitalize<Bucket>;
}

function getBucketBalance(balances: UserBalance, bucket: Bucket): number {
    return bucket === "tier" ? balances.tierBalance : balances.packBalance;
}
