import { and, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/better-auth.ts";
import { rewards, user as userTable } from "../db/better-auth.ts";
import type { Bucket } from "./deduction.ts";

export const MAX_REWARD_AMOUNT = 10_000;

export interface RecordRewardInput {
    /**
     * Idempotency guard. Must be deterministic for the logical reward so retries
     * never create duplicates; encodes the quest's completion scope, e.g.
     * "quest:{issue}" or "quest:{questId}:user:{userId}".
     */
    idempotencyKey: string;
    userId: string;
    amount: number;
    /** Which balance bucket to credit on claim. */
    bucket: Bucket;
    /** Catalog id of the quest that was earned; null for one-off rewards. */
    questId?: string | null;
    /** Quest title, snapshotted so history renders it without a catalog lookup. */
    title: string;
    /** Optional quest link, snapshotted so history renders it directly. */
    url?: string | null;
}

export interface RecordRewardResult {
    /** true if this call created a new pending reward; false if duplicate. */
    recorded: boolean;
    rewardId: string | null;
}

export interface RecordRewardsResult {
    /** Number of newly created pending rewards. */
    recorded: number;
    /** IDs of newly created pending rewards. Duplicate inputs are omitted. */
    rewardIds: string[];
}

export interface ClaimRewardResult {
    claimed: boolean;
    reward: {
        id: string;
        questId: string | null;
        title: string;
        pollenAmount: number;
        balanceBucket: Bucket;
        earnedAt: Date;
        claimedAt: Date | null;
    } | null;
    newBalance: number | null;
}

type AuthDb = DrizzleD1Database<typeof schema>;

function assertRewardAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_REWARD_AMOUNT) {
        throw new Error(
            `reward amount must be > 0 and <= ${MAX_REWARD_AMOUNT}, got: ${amount}`,
        );
    }
}

// D1 binds every value as a parameter and caps a statement at 100 bound
// variables. Each reward row binds 8 columns, so 12 rows (96 params) is the
// largest safe chunk.
const REWARD_INSERT_CHUNK = 12;

/**
 * Records earned rewards without moving pollen. The unique idempotency key
 * makes scanner retries safe; only claimReward() credits the user's balance.
 */
export async function recordRewards(
    db: AuthDb,
    inputs: RecordRewardInput[],
): Promise<RecordRewardsResult> {
    if (inputs.length === 0) return { recorded: 0, rewardIds: [] };

    const rows = inputs.map((input) => {
        assertRewardAmount(input.amount);
        return {
            id: crypto.randomUUID(),
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            questId: input.questId ?? null,
            title: input.title,
            url: input.url ?? null,
            pollenAmount: input.amount,
            balanceBucket: input.bucket,
        };
    });

    const rewardIds: string[] = [];
    for (let i = 0; i < rows.length; i += REWARD_INSERT_CHUNK) {
        const chunk = rows.slice(i, i + REWARD_INSERT_CHUNK);
        const inserted = await db
            .insert(rewards)
            .values(chunk)
            .onConflictDoNothing({ target: rewards.idempotencyKey })
            .returning({ id: rewards.id });
        rewardIds.push(...inserted.map((row) => row.id));
    }

    return {
        recorded: rewardIds.length,
        rewardIds,
    };
}

/**
 * Single-reward convenience wrapper. Kept for direct callers that need the
 * created reward id; scheduled reconciliation uses recordRewards().
 */
export async function recordReward(
    db: AuthDb,
    input: RecordRewardInput,
): Promise<RecordRewardResult> {
    const result = await recordRewards(db, [input]);

    return {
        recorded: result.recorded === 1,
        rewardId: result.rewardIds[0] ?? null,
    };
}

/**
 * Claims one pending reward and credits the chosen balance bucket. The balance
 * update is gated on the preceding `claimed_at IS NULL` update, so retries and
 * double-clicks cannot double-pay.
 */
export async function claimReward(
    db: AuthDb,
    {
        rewardId,
        userId,
    }: {
        rewardId: string;
        userId: string;
    },
): Promise<ClaimRewardResult> {
    const row = await loadRewardForUser(db, rewardId, userId);
    if (!row) return { claimed: false, reward: null, newBalance: null };
    if (row.claimedAt !== null) {
        return { claimed: false, reward: row, newBalance: null };
    }

    assertRewardAmount(row.pollenAmount);

    const bucketColumn =
        row.balanceBucket === "tier" ? sql`tier_balance` : sql`pack_balance`;
    const claimedAt = new Date();

    const [, updateResult] = await db.batch([
        db
            .update(rewards)
            .set({ claimedAt })
            .where(
                and(
                    eq(rewards.id, rewardId),
                    eq(rewards.userId, userId),
                    isNull(rewards.claimedAt),
                ),
            ),
        db
            .update(userTable)
            .set({
                [`${row.balanceBucket}Balance`]: sql`COALESCE(${bucketColumn}, 0) + ${row.pollenAmount}`,
            })
            .where(sql`${userTable.id} = ${userId} AND changes() = 1`)
            .returning({ newBalance: bucketColumn }),
    ]);

    const updatedRows =
        (updateResult as Array<{ newBalance: number | null }>) ?? [];
    const claimed = updatedRows.length === 1;
    if (!claimed) {
        const latest = await loadRewardForUser(db, rewardId, userId);
        return { claimed: false, reward: latest, newBalance: null };
    }

    return {
        claimed: true,
        reward: { ...row, claimedAt },
        newBalance: updatedRows[0]?.newBalance ?? null,
    };
}

async function loadRewardForUser(
    db: AuthDb,
    rewardId: string,
    userId: string,
): Promise<ClaimRewardResult["reward"]> {
    const rows = await db
        .select({
            id: rewards.id,
            questId: rewards.questId,
            title: rewards.title,
            pollenAmount: rewards.pollenAmount,
            balanceBucket: rewards.balanceBucket,
            earnedAt: rewards.earnedAt,
            claimedAt: rewards.claimedAt,
        })
        .from(rewards)
        .where(and(eq(rewards.id, rewardId), eq(rewards.userId, userId)))
        .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
        ...row,
        balanceBucket: row.balanceBucket as Bucket,
    };
}
