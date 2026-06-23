import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { QUEST_GROUPS } from "./quests/index.ts";
import { type QuestEvaluationContext, toGrant } from "./quests/types.ts";

const log = getLogger(["enter", "quest-evaluator"]);

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
    error?: string;
};

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: boolean; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const ctx: QuestEvaluationContext = { db, env };
    const results = new Map<string, QuestEvaluatorResult>();

    const ensureResult = (questId: string): QuestEvaluatorResult => {
        let entry = results.get(questId);
        if (!entry) {
            entry = { questId, scanned: 0, granted: 0 };
            results.set(questId, entry);
        }
        return entry;
    };

    for (const group of QUEST_GROUPS) {
        try {
            const cards = await group.listQuestCards(ctx);
            for (const card of cards) {
                ensureResult(card.id);
            }

            const proposals = await group.findRewardProposals(ctx);
            for (const proposal of proposals) {
                const entry = ensureResult(proposal.quest.id);
                entry.scanned += 1;
                const result = await grantReward(db, toGrant(proposal));
                if (result.granted) entry.granted += 1;
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const questId = `group:${group.id}`;
            log.error(
                "QUEST_EVALUATOR_FAILED: groupId={groupId} error={error}",
                { groupId: group.id, error: message },
            );
            const entry = ensureResult(questId);
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
