import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";
import { loadUsageQuestSummary } from "../usage-summary.ts";

const MODEL_THRESHOLD = 3;

const firstImageQuest: QuestDefinition = {
    id: "onboarding:first_image",
    title: "Generate your first image",
    description: "Create one image with Pollinations.",
    iconId: "image",
    category: "plant",
    scope: "perUser",
    rewardAmount: 0.5,
    balanceBucket: "pack",
};

const firstChatCompletionQuest: QuestDefinition = {
    id: "onboarding:first_chat_completion",
    title: "Run your first chat completion",
    description: "Send one chat completion request.",
    iconId: "chat",
    category: "plant",
    scope: "perUser",
    rewardAmount: 0.5,
    balanceBucket: "pack",
};

const tryThreeModelsQuest: QuestDefinition = {
    id: "onboarding:try_three_models",
    title: "Try three different models",
    description: "Use three distinct Pollinations models.",
    iconId: "tokens",
    category: "plant",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [firstImageQuest, firstChatCompletionQuest, tryThreeModelsQuest].map(
        (quest) => questToCard(quest),
    );
}

export async function findRewardProposals({
    env,
}: QuestEvaluationContext): Promise<RewardProposal[]> {
    const rows = await loadUsageQuestSummary(env);
    const proposals: RewardProposal[] = [];

    for (const row of rows) {
        if (row.imageRequests > 0) {
            proposals.push({ quest: firstImageQuest, userId: row.userId });
        }
        if (row.textRequests > 0) {
            proposals.push({
                quest: firstChatCompletionQuest,
                userId: row.userId,
            });
        }
        if (row.distinctModels >= MODEL_THRESHOLD) {
            proposals.push({ quest: tryThreeModelsQuest, userId: row.userId });
        }
    }

    return proposals;
}
