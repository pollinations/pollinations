import { getLogger } from "@logtape/logtape";
import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { excludeExistingRewards } from "./quests/grant-filter.ts";
import { loadQuests } from "./quests/index.ts";
import { type QuestEvaluationContext, toGrant } from "./quests/types.ts";

const log = getLogger(["enter", "quest-evaluator"]);

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
    error?: string;
};

/**
 * Each quest proposes reward CANDIDATES (who it thinks earned it). The evaluator
 * owns the two generic concerns the quests must not: dedup against already-paid
 * rewards (excludeExistingRewards, once over the whole batch), and the actual
 * grant write (grantReward, the idempotent chokepoint). Results are seeded in
 * quest order so the positional array is stable even for a quest that proposes
 * nothing.
 */
export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: boolean; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const ctx: QuestEvaluationContext = { db, env };
    const quests = await loadQuests(ctx);

    const results = new Map<string, QuestEvaluatorResult>();
    for (const quest of quests) {
        results.set(quest.id, { questId: quest.id, scanned: 0, granted: 0 });
    }

    // 1. Collect candidates per quest. A failing quest is isolated — its error
    //    is recorded and it contributes no candidates; others proceed.
    const candidates: { questId: string; reward: GrantRewardInput }[] = [];
    for (const quest of quests) {
        const entry = results.get(quest.id);
        if (!entry) continue;
        try {
            const awards = await quest.findRewards(ctx);
            entry.scanned = awards.length;
            for (const award of awards) {
                candidates.push({
                    questId: quest.id,
                    reward: toGrant(quest, award),
                });
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log.error(
                "QUEST_EVALUATOR_FAILED: questId={questId} error={error}",
                { questId: quest.id, error: message },
            );
            entry.error = message;
        }
    }

    // 2. Generic dedup: drop candidates whose idempotency key was already paid.
    //    One DB round-trip for the whole batch. (grantReward is still the final
    //    idempotent backstop against races.)
    const fresh = await excludeExistingRewards(
        db,
        candidates.map((candidate) => candidate.reward),
    );
    const freshKeys = new Set(fresh.map((reward) => reward.idempotencyKey));

    // 3. Grant the survivors, bucketing each back to its quest's result.
    for (const { questId, reward } of candidates) {
        if (!freshKeys.has(reward.idempotencyKey)) continue;
        const entry = results.get(questId);
        if (!entry) continue;
        const result = await grantReward(db, reward);
        if (result.granted) entry.granted += 1;
    }

    const ordered = [...results.values()];
    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", {
        results: ordered,
    });
    return {
        success: ordered.every((result) => !result.error),
        results: ordered,
    };
}
