import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { user as userTable } from "../db/schema/better-auth.ts";

/**
 * Balance buckets, in the order they are consumed by atomicDeductUserBalance.
 *
 * - tier: free, hourly-refilled allowance per tier
 * - creator: earnings from BYOP markup on apps the user owns (spendable)
 * - crypto: purchased via NOWPayments, cumulative
 * - pack: purchased via Stripe/Polar, cumulative
 */
export const BALANCE_BUCKETS = ["tier", "creator", "crypto", "pack"] as const;
export type Bucket = (typeof BALANCE_BUCKETS)[number];

export type UserBalance = Record<`${Bucket}Balance`, number>;

const BUCKET_COLUMNS = {
    tier: userTable.tierBalance,
    creator: userTable.creatorBalance,
    crypto: userTable.cryptoBalance,
    pack: userTable.packBalance,
} as const satisfies Record<Bucket, unknown>;

/**
 * Atomically deducts pollen from user balance.
 *
 * Priority when paid balance is positive: tier → creator → crypto → pack.
 * If no positive paid balance (crypto + pack ≤ 0), always deducts from tier —
 * tier refills hourly so going negative is fine and prevents spillover into
 * purchased buckets. Creator earnings are treated as "paid" for this check,
 * since they shouldn't be silently drained when the user's purchased balance
 * is empty.
 */
export async function atomicDeductUserBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

    await db.run(sql`
		UPDATE ${userTable}
		SET
			tier_balance = CASE
				WHEN (COALESCE(crypto_balance, 0) + COALESCE(pack_balance, 0) + COALESCE(creator_balance, 0)) <= 0 THEN COALESCE(tier_balance, 0) - ${amount}
				WHEN COALESCE(tier_balance, 0) > 0 THEN COALESCE(tier_balance, 0) - ${amount}
				ELSE tier_balance
			END,
			creator_balance = CASE
				WHEN (COALESCE(crypto_balance, 0) + COALESCE(pack_balance, 0) + COALESCE(creator_balance, 0)) <= 0 THEN creator_balance
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(creator_balance, 0) > 0 THEN COALESCE(creator_balance, 0) - ${amount}
				ELSE creator_balance
			END,
			crypto_balance = CASE
				WHEN (COALESCE(crypto_balance, 0) + COALESCE(pack_balance, 0) + COALESCE(creator_balance, 0)) <= 0 THEN crypto_balance
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(creator_balance, 0) <= 0 AND COALESCE(crypto_balance, 0) > 0 THEN COALESCE(crypto_balance, 0) - ${amount}
				ELSE crypto_balance
			END,
			pack_balance = CASE
				WHEN (COALESCE(crypto_balance, 0) + COALESCE(pack_balance, 0) + COALESCE(creator_balance, 0)) <= 0 THEN pack_balance
				WHEN COALESCE(tier_balance, 0) <= 0 AND COALESCE(creator_balance, 0) <= 0 AND COALESCE(crypto_balance, 0) <= 0 THEN COALESCE(pack_balance, 0) - ${amount}
				ELSE pack_balance
			END
		WHERE id = ${userId}
	`);
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
 * Atomically credits pollen to any user balance bucket.
 *
 * Returns { ok } — false means the user row was missing (UPDATE affected 0
 * rows). `newBalance` is the post-credit value when available. Throws on D1
 * errors — the caller decides how to react.
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
        .set({ [`${bucket}Balance`]: sql`COALESCE(${column}, 0) + ${amount}` })
        .where(sql`${userTable.id} = ${userId}`)
        .returning({ newBalance: column });

    return {
        ok: rows.length > 0,
        newBalance: rows[0]?.newBalance ?? null,
    };
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
            creatorBalance: userTable.creatorBalance,
            cryptoBalance: userTable.cryptoBalance,
            packBalance: userTable.packBalance,
        })
        .from(userTable)
        .where(sql`${userTable.id} = ${userId}`)
        .limit(1);

    const user = result[0];
    return {
        tierBalance: user?.tierBalance ?? 0,
        creatorBalance: user?.creatorBalance ?? 0,
        cryptoBalance: user?.cryptoBalance ?? 0,
        packBalance: user?.packBalance ?? 0,
    };
}

export type DeductionSource = Record<`from${Capitalize<Bucket>}`, number>;

/**
 * Identifies which single balance bucket a deduction comes from.
 * Mirrors the CASE logic in atomicDeductUserBalance:
 * - If no positive paid balance → always tier
 * - Otherwise: tier → creator → crypto → pack
 */
export function identifyDeductionSource(
    balances: UserBalance,
    amount: number,
): DeductionSource {
    const zero: DeductionSource = {
        fromTier: 0,
        fromCreator: 0,
        fromCrypto: 0,
        fromPack: 0,
    };
    const { tierBalance, creatorBalance, cryptoBalance, packBalance } =
        balances;

    if (creatorBalance + cryptoBalance + packBalance <= 0)
        return { ...zero, fromTier: amount };
    if (tierBalance > 0) return { ...zero, fromTier: amount };
    if (creatorBalance > 0) return { ...zero, fromCreator: amount };
    if (cryptoBalance > 0) return { ...zero, fromCrypto: amount };
    return { ...zero, fromPack: amount };
}

/**
 * Atomically deducts pollen from paid balances only (excluding tier_balance
 * and creator_balance — earnings are not "paid" for paid-only-model purposes).
 * Picks the first positive bucket: crypto → pack. Full amount from one bucket.
 */
export async function atomicDeductPaidBalance(
    db: DrizzleD1Database,
    userId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

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
