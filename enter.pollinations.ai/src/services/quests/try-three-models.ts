import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { excludeExistingGrants } from "./grant-filter.ts";
import type { QuestDb, QuestModule } from "./types.ts";
import {
    loadUsageQuestSummary,
    type UsageQuestSummaryRow,
} from "./usage-summary.ts";

const MODEL_THRESHOLD = 3;

export const tryThreeModelsQuest = {
    definition: {
        id: "onboarding:try_three_models",
        title: "Try three different models",
        description: "Use three distinct Pollinations models.",
        rewardAmount: 1,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        const rows = await loadUsageQuestSummary(env);
        return findGrants(db, rows);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${tryThreeModelsQuest.definition.id}:user:`;

async function findGrants(
    db: QuestDb,
    rows: UsageQuestSummaryRow[],
): Promise<GrantRewardInput[]> {
    const grants = rows
        .filter((row) => row.distinctModels >= MODEL_THRESHOLD)
        .map((row) => ({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: tryThreeModelsQuest.definition.id,
            amount: tryThreeModelsQuest.definition.rewardAmount,
            bucket: tryThreeModelsQuest.definition.balanceBucket,
            sourceRef: `models:${row.distinctModels}`,
            metadata: {
                title: tryThreeModelsQuest.definition.title,
                modelCount: row.distinctModels,
                threshold: MODEL_THRESHOLD,
            },
        }));

    return excludeExistingGrants(db, grants);
}
