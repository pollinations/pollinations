import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
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
 * Each quest proposes reward CANDIDATES (who it thinks earned it); the evaluator
 * grants each one via grantReward, the idempotent chokepoint — an INSERT OR
 * IGNORE on the idempotency key, so a candidate that was already paid credits
 * nothing and reports granted:false. That single guarantee is the whole dedup
 * story: no pre-filter needed, re-runs are safe by construction. `scanned` is
 * the candidate count (before grant); `granted` counts the writes that landed.
 * Results are seeded in quest order so the positional array is stable even for a
 * quest that proposes nothing, and a failing quest is isolated (its error is
 * recorded; others proceed).
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

    for (const quest of quests) {
        const entry = results.get(quest.id);
        if (!entry) continue;
        try {
            const awards = await quest.findRewards(ctx);
            entry.scanned = awards.length;
            for (const award of awards) {
                const result = await grantReward(db, toGrant(quest, award));
                if (result.granted) entry.granted += 1;
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

    const ordered = [...results.values()];
    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", {
        results: ordered,
    });
    return {
        success: ordered.every((result) => !result.error),
        results: ordered,
    };
}
