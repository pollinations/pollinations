import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { inArray } from "drizzle-orm";
import type { QuestDb } from "./types.ts";

const SQLITE_BIND_LIMIT_BUFFER = 500;

/**
 * The one generic reward dedup funnel. Every group's findRewards ends by
 * passing its proposals through this: any proposal whose idempotency key is
 * already persisted in reward_grants is dropped, so re-runs never double-pay.
 */
export async function excludeExistingRewards(
    db: QuestDb,
    rewards: GrantRewardInput[],
): Promise<GrantRewardInput[]> {
    if (!rewards.length) return rewards;

    const existing = new Set<string>();
    const keys = rewards.map((reward) => reward.idempotencyKey);

    for (
        let index = 0;
        index < keys.length;
        index += SQLITE_BIND_LIMIT_BUFFER
    ) {
        const chunk = keys.slice(index, index + SQLITE_BIND_LIMIT_BUFFER);
        const rows = await db
            .select({ idempotencyKey: schema.rewardGrants.idempotencyKey })
            .from(schema.rewardGrants)
            .where(inArray(schema.rewardGrants.idempotencyKey, chunk));
        for (const row of rows) existing.add(row.idempotencyKey);
    }

    return rewards.filter((reward) => !existing.has(reward.idempotencyKey));
}
