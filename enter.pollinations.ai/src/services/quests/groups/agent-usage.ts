import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";

const useAgentQuest: QuestDefinition = {
    id: "use_agent",
    title: "Use an agent",
    description:
        "Make one successful request to any prompt, code, or externally hosted [agent](https://gen.pollinations.ai/docs#tag/community-agents).",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const createUsedAgentQuest: QuestDefinition = {
    id: "create_used_agent",
    title: "Create an agent that gets used",
    description:
        "Create an [agent](https://enter.pollinations.ai/my-models) that receives at least one successful request. Your own test request counts.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
};

export async function listQuestCards() {
    return [useAgentQuest, createUsedAgentQuest].map(questToCard);
}

export async function evaluateUser(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const rows = await fetchTinybirdRows<{
        userId: string;
        usedAgent: number;
        createdUsedAgent: number;
    }>(
        new URL(env.TINYBIRD_INGEST_URL).origin,
        "/v0/pipes/quest_agent_usage.json",
        requireTinybirdReadToken(env),
        { user_id: user.id, github_username: user.githubUsername ?? "" },
    );
    const row = rows.find((entry) => entry.userId === user.id);
    return {
        proposals: [
            ...(row?.usedAgent === 1
                ? [{ quest: useAgentQuest, userId: user.id }]
                : []),
            ...(row?.createdUsedAgent === 1
                ? [{ quest: createUsedAgentQuest, userId: user.id }]
                : []),
        ],
    };
}
