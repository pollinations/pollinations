import type { Bucket } from "../billing/deduction.ts";

export const PRODUCT_QUEST_REWARD_SOURCE = "product_quest";
export const GITHUB_QUEST_REWARD_SOURCE = "code_quest";
export const COMMUNITY_GITHUB_QUEST_ID = "github:community_issue_quest";
export const GITHUB_QUEST_DEFAULT_BALANCE_BUCKET = "pack" satisfies Bucket;

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    rewardAmount: number;
    balanceBucket: Bucket;
};

export function buildGitHubQuestRewardKey({
    issueNumber,
}: {
    issueNumber: number;
}): string {
    return `quest:${issueNumber}`;
}
