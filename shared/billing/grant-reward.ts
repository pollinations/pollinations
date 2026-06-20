import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/better-auth.ts";
import { rewardGrants, user as userTable } from "../db/better-auth.ts";
import type { Bucket } from "./deduction.ts";

export const MAX_REWARD_GRANT_AMOUNT = 10_000;

export interface GrantRewardInput {
    /**
     * Idempotency guard. Must be deterministic for the logical grant so retries
     * never double-pay, e.g. "quest:{issue}" or
     * "quest:{questId}:user:{userId}". Mirrors the payout_key pattern of
     * quest_payout_credits / the session_id of stripe_checkout_credits.
     */
    idempotencyKey: string;
    userId: string;
    /** Grant kind, e.g. code_quest | product_quest | referral | manual. */
    source: string;
    amount: number;
    /** Which balance bucket to credit. Defaults to "pack"; pass "tier" to override. */
    bucket?: Bucket;
    /** Catalog id for product quests; null for one-off grants. */
    questId?: string | null;
    /** External reference: PR number, Stripe session, generation id, … */
    sourceRef?: string | null;
    /** Display metadata snapshot (title/url/details) at grant time. */
    metadata?: Record<string, unknown> | null;
}

export interface GrantRewardResult {
    /** true if this call created the grant; false if it was a duplicate (no-op). */
    granted: boolean;
    newBalance: number | null;
}

type AuthDb = DrizzleD1Database<typeof schema>;

/**
 * Records a discrete pollen grant and credits the user's balance atomically.
 *
 * This follows stripe-webhooks' creditCheckoutSessionOnce(): a single D1 batch
 * that inserts an idempotent reward_grants row and, only when that insert is
 * fresh, adds the pollen to the chosen balance bucket. INSERT OR IGNORE on the
 * unique idempotency_key makes retries safe — a duplicate insert credits
 * nothing.
 *
 * The grant row is the authoritative fact (real pollen moved); it lives in D1,
 * never only in append-only Tinybird. Worker context only (needs DB binding).
 */
export async function grantReward(
    db: AuthDb,
    input: GrantRewardInput,
): Promise<GrantRewardResult> {
    const {
        idempotencyKey,
        userId,
        source,
        amount,
        bucket = "pack",
        questId = null,
        sourceRef = null,
        metadata = null,
    } = input;

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > MAX_REWARD_GRANT_AMOUNT
    ) {
        throw new Error(
            `grantReward amount must be > 0 and <= ${MAX_REWARD_GRANT_AMOUNT}, got: ${amount}`,
        );
    }

    const bucketColumn =
        bucket === "tier" ? sql`tier_balance` : sql`pack_balance`;

    // Single batch so the grant record and the balance credit commit together.
    // The UPDATE is gated on `changes() = 1` so a duplicate (ignored) insert
    // credits nothing.
    const [, updateResult] = await db.batch([
        db
            .insert(rewardGrants)
            .values({
                id: crypto.randomUUID(),
                idempotencyKey,
                userId,
                source,
                questId,
                pollenCredited: amount,
                balanceBucket: bucket,
                sourceRef,
                metadataJson: metadata ? JSON.stringify(metadata) : null,
            })
            .onConflictDoNothing({ target: rewardGrants.idempotencyKey }),
        db
            .update(userTable)
            .set({
                [`${bucket}Balance`]: sql`COALESCE(${bucketColumn}, 0) + ${amount}`,
            })
            .where(sql`${userTable.id} = ${userId} AND changes() = 1`)
            .returning({ newBalance: bucketColumn }),
    ]);

    // In a D1 batch, an UPDATE ... RETURNING resolves to a plain array of the
    // returned rows. A fresh grant updates exactly one row; a duplicate
    // (ignored) insert leaves changes() != 1 so the guarded UPDATE matches
    // nothing and the array is empty.
    const updatedRows =
        (updateResult as Array<{ newBalance: number | null }>) ?? [];
    const granted = updatedRows.length === 1;

    return {
        granted,
        newBalance: granted ? (updatedRows[0]?.newBalance ?? null) : null,
    };
}
