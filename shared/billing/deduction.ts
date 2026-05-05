import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apiKeyTable, user as userTable } from "../db/better-auth.ts";
import {
    type BalanceBucket,
    selectBalanceBucket,
    type UserBalance,
} from "./balance.ts";

export const BALANCE_BUCKETS = ["tier", "pack"] as const;
export type Bucket = BalanceBucket;

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
 * Regular requests are binary: if tier can cover the full charge, the full
 * charge is deducted from tier; otherwise the full charge is deducted from pack.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<{ ok: boolean; bucket: Bucket | null }> {
    if (amount <= 0) return { ok: true, bucket: null };

    const tierResult = await db.run(sql`
			UPDATE ${userTable}
			SET tier_balance = COALESCE(tier_balance, 0) - ${amount}
			WHERE id = ${userId}
			AND COALESCE(tier_balance, 0) >= ${amount}
		`);

    if ((tierResult.meta.changes ?? 0) > 0) {
        return { ok: true, bucket: "tier" };
    }

    const result = await db.run(sql`
			UPDATE ${userTable}
			SET pack_balance = COALESCE(pack_balance, 0) - ${amount}
			WHERE id = ${userId}
		`);

    const ok = (result.meta.changes ?? 0) > 0;
    return { ok, bucket: ok ? "pack" : null };
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

/** Identifies which bucket pays a deduction under a policy. */
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

    const bucket =
        policy === BILLING_POLICIES.paidOnly
            ? "pack"
            : selectBalanceBucket(balances, amount);
    return {
        ...zero,
        [`from${capitalizeBucket(bucket)}`]: amount,
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

function capitalizeBucket(bucket: Bucket): Capitalize<Bucket> {
    return (bucket[0].toUpperCase() + bucket.slice(1)) as Capitalize<Bucket>;
}
