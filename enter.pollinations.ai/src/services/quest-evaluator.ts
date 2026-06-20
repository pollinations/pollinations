import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildRewardKey,
    PRODUCT_QUEST_REWARD_SOURCE,
    type QuestDefinition,
    type RewardProposal,
} from "@shared/quests/definitions.ts";
import { drizzle } from "drizzle-orm/d1";
import { QUESTS } from "./quests/index.ts";
import type { QuestDb } from "./quests/types.ts";

const log = getLogger(["enter", "quest-evaluator"]);

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
};

export function buildQuestRewardMetadata(
    definition: QuestDefinition,
    proposal: RewardProposal,
): Record<string, unknown> {
    return {
        ...(proposal.metadata ?? {}),
        title: definition.title,
    };
}

export async function commitRewardProposals({
    db,
    definition,
    proposals,
}: {
    db: QuestDb;
    definition: QuestDefinition;
    proposals: RewardProposal[];
}): Promise<QuestEvaluatorResult> {
    let granted = 0;
    for (const proposal of proposals) {
        const result = await grantReward(db, {
            idempotencyKey: buildRewardKey(definition, proposal),
            userId: proposal.userId,
            source: proposal.source ?? PRODUCT_QUEST_REWARD_SOURCE,
            questId: definition.id,
            amount: proposal.amount ?? definition.rewardAmount,
            bucket: proposal.bucket ?? definition.balanceBucket,
            sourceRef: proposal.sourceRef,
            metadata: buildQuestRewardMetadata(definition, proposal),
        });
        if (result.granted) granted += 1;
    }

    return {
        questId: definition.id,
        scanned: proposals.length,
        granted,
    };
}

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: true; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const results: QuestEvaluatorResult[] = [];

    for (const quest of QUESTS) {
        const proposals = await quest.evaluate({ db, env });
        results.push(
            await commitRewardProposals({
                db,
                definition: quest.definition,
                proposals,
            }),
        );
    }

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return { success: true, results };
}
