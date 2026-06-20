import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { QUESTS } from "./quests/index.ts";

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
    const results: QuestEvaluatorResult[] = [];

    for (const quest of QUESTS) {
        let scanned = 0;
        try {
            const grants = await quest.evaluate({ db, env });
            scanned = grants.length;
            let granted = 0;
            for (const grant of grants) {
                const result = await grantReward(db, grant);
                if (result.granted) granted += 1;
            }
            results.push({
                questId: quest.definition.id,
                scanned,
                granted,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log.error(
                "QUEST_EVALUATOR_FAILED: questId={questId} error={error}",
                {
                    questId: quest.definition.id,
                    error: message,
                },
            );
            results.push({
                questId: quest.definition.id,
                scanned,
                granted: 0,
                error: message,
            });
        }
    }

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return {
        success: results.every((result) => !result.error),
        results,
    };
}
