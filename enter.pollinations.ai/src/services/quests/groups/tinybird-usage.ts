import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";
import { loadUsageQuestSummary } from "../usage-summary.ts";

const MODEL_THRESHOLD = 3;

/**
 * A quest IS its definition plus its own findRewards. findRewards returns
 * AWARDS — only what varies per recipient (key + user). The scaffolding
 * (toGrant) fills in the rest from the definition, dedups, and grants. The
 * "group" is just the file these usage quests share.
 */

const firstImageQuest: Quest = {
    id: "onboarding:first_image",
    title: "Generate your first image",
    description: "Create one image with Pollinations.",
    iconId: "image",
    category: "plant",
    scope: "perUser",
    rewardAmount: 0.5,
    balanceBucket: "pack",
    async findRewards({ env }): Promise<QuestAward[]> {
        const rows = await loadUsageQuestSummary(env);
        return rows
            .filter((row) => row.imageRequests > 0)
            .map((row) => ({ userId: row.userId }));
    },
};

const firstChatCompletionQuest: Quest = {
    id: "onboarding:first_chat_completion",
    title: "Run your first chat completion",
    description: "Send one chat completion request.",
    iconId: "chat",
    category: "plant",
    scope: "perUser",
    rewardAmount: 0.5,
    balanceBucket: "pack",
    async findRewards({ env }): Promise<QuestAward[]> {
        const rows = await loadUsageQuestSummary(env);
        return rows
            .filter((row) => row.textRequests > 0)
            .map((row) => ({ userId: row.userId }));
    },
};

const tryThreeModelsQuest: Quest = {
    id: "onboarding:try_three_models",
    title: "Try three different models",
    description: "Use three distinct Pollinations models.",
    iconId: "tokens",
    category: "plant",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
    async findRewards({ env }): Promise<QuestAward[]> {
        const rows = await loadUsageQuestSummary(env);
        return rows
            .filter((row) => row.distinctModels >= MODEL_THRESHOLD)
            .map((row) => ({ userId: row.userId }));
    },
};

/**
 * The usage quests living in this file — the entire public surface of the
 * group. index.ts awaits every group's loadQuests; the evaluator turns each
 * quest's awards into grants; the catalog serializes each definition. These
 * quests are static, so the context is ignored.
 */
export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [firstImageQuest, firstChatCompletionQuest, tryThreeModelsQuest];
}
