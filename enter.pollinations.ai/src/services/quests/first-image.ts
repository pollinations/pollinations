import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { excludeExistingGrants } from "./grant-filter.ts";
import type { QuestDb, QuestModule } from "./types.ts";
import {
    loadUsageQuestSummary,
    type UsageQuestSummaryRow,
} from "./usage-summary.ts";

export const firstImageQuest = {
    definition: {
        id: "onboarding:first_image",
        title: "Generate your first image",
        description: "Create one image with Pollinations.",
        iconId: "image",
        rewardAmount: 0.5,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        const rows = await loadUsageQuestSummary(env);
        return findGrants(db, rows);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${firstImageQuest.definition.id}:user:`;

async function findGrants(
    db: QuestDb,
    rows: UsageQuestSummaryRow[],
): Promise<GrantRewardInput[]> {
    const grants = rows
        .filter((row) => row.imageRequests > 0 && row.firstImageEventId)
        .map((row) => ({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: firstImageQuest.definition.id,
            amount: firstImageQuest.definition.rewardAmount,
            bucket: firstImageQuest.definition.balanceBucket,
            sourceRef: row.firstImageEventId,
            metadata: {
                title: firstImageQuest.definition.title,
                imageRequests: row.imageRequests,
            },
        }));

    return excludeExistingGrants(db, grants);
}
