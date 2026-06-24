import * as schema from "@shared/db/better-auth.ts";
import { count, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

/**
 * Quest statistics — read entirely from the rewards ledger. Rewards are
 * materialized lazily when a user checks their quests, so these are ledger
 * totals for checked users, not total latent eligibility counts.
 *   - earned    = rows for the quest_id
 *   - claimed   = rows with claimed_at set (pulled into the user's balance)
 *   - unclaimed = earned but not yet claimed (claimed_at IS NULL)
 * One GROUP BY over a small table — cheap enough for the public catalog.
 */

export type RewardLedgerStat = {
    questId: string;
    earned: number;
    claimed: number;
    unclaimed: number;
    pollenAwarded: number;
    pollenClaimed: number;
};

/**
 * Per-quest earned/claimed/pollen aggregates from the rewards ledger.
 */
export async function getRewardLedgerStats(
    env: CloudflareBindings,
): Promise<Map<string, RewardLedgerStat>> {
    const db = drizzle(env.DB, { schema });
    const rows = await db
        .select({
            questId: schema.rewards.questId,
            earned: count(),
            claimed: count(schema.rewards.claimedAt),
            pollenAwarded: sql<number>`COALESCE(SUM(${schema.rewards.pollenAmount}), 0)`,
            pollenClaimed: sql<number>`COALESCE(SUM(CASE WHEN ${schema.rewards.claimedAt} IS NOT NULL THEN ${schema.rewards.pollenAmount} ELSE 0 END), 0)`,
        })
        .from(schema.rewards)
        .where(isNotNull(schema.rewards.questId))
        .groupBy(schema.rewards.questId);

    const byQuest = new Map<string, RewardLedgerStat>();
    for (const row of rows) {
        if (!row.questId) continue;
        byQuest.set(row.questId, {
            questId: row.questId,
            earned: row.earned,
            claimed: row.claimed,
            unclaimed: row.earned - row.claimed,
            pollenAwarded: row.pollenAwarded,
            pollenClaimed: row.pollenClaimed,
        });
    }

    return byQuest;
}
