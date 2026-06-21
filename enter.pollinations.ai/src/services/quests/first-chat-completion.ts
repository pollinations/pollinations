import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { excludeExistingGrants } from "./grant-filter.ts";
import type { QuestDb, QuestModule } from "./types.ts";
import {
    loadUsageQuestSummary,
    type UsageQuestSummaryRow,
} from "./usage-summary.ts";

export const firstChatCompletionQuest = {
    definition: {
        id: "onboarding:first_chat_completion",
        title: "Run your first chat completion",
        description: "Send one chat completion request.",
        rewardAmount: 0.5,
        balanceBucket: "pack",
    },
    async evaluate({ db, env }) {
        const rows = await loadUsageQuestSummary(env);
        return findGrants(db, rows);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${firstChatCompletionQuest.definition.id}:user:`;

async function findGrants(
    db: QuestDb,
    rows: UsageQuestSummaryRow[],
): Promise<GrantRewardInput[]> {
    const grants = rows
        .filter((row) => row.textRequests > 0 && row.firstTextEventId)
        .map((row) => ({
            idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
            userId: row.userId,
            source: PRODUCT_QUEST_REWARD_SOURCE,
            questId: firstChatCompletionQuest.definition.id,
            amount: firstChatCompletionQuest.definition.rewardAmount,
            bucket: firstChatCompletionQuest.definition.balanceBucket,
            sourceRef: row.firstTextEventId,
            metadata: {
                title: firstChatCompletionQuest.definition.title,
                textRequests: row.textRequests,
            },
        }));

    return excludeExistingGrants(db, grants);
}
