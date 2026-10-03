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

const useCommunityModelQuest: QuestDefinition = {
    id: "use_community_model",
    title: "Try a community model",
    description:
        "Make one successful request to any [community model](https://gen.pollinations.ai/docs#tag/community-models). Agents have their own quest.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const createUsedCommunityModelQuest: QuestDefinition = {
    id: "create_used_community_model",
    title: "Your community model gets used",
    description:
        "Publish a [community model](https://enter.pollinations.ai/my-models). Earn this after other people spend more than 0.5 Paid Pollen in total on your community models. Your own requests and agents do not count.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
};

// Each quest completes when its flag from quest_agent_usage is 1.
const QUEST_FLAGS = [
    ["usedAgent", useAgentQuest],
    ["createdUsedAgent", createUsedAgentQuest],
    ["usedCommunityModel", useCommunityModelQuest],
    ["createdUsedCommunityModel", createUsedCommunityModelQuest],
] as const;

type QuestFlag = (typeof QUEST_FLAGS)[number][0];

export async function listQuestCards() {
    return QUEST_FLAGS.map(([, quest]) => questToCard(quest));
}

export async function evaluateUser(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const rows = await fetchTinybirdRows<
        { userId: string } & Record<QuestFlag, number>
    >(
        new URL(env.TINYBIRD_INGEST_URL).origin,
        "/v0/pipes/quest_agent_usage.json",
        requireTinybirdReadToken(env),
        { user_id: user.id, github_username: user.githubUsername ?? "" },
    );
    const row = rows.find((entry) => entry.userId === user.id);
    return {
        proposals: QUEST_FLAGS.filter(([flag]) => row?.[flag] === 1).map(
            ([, quest]) => ({ quest, userId: user.id }),
        ),
    };
}
