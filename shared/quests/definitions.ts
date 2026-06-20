import type { Bucket } from "../billing/deduction.ts";

export type PayoutScope = "once_per_user" | "once_per_event_per_user";

export const PRODUCT_QUEST_REWARD_SOURCE = "product_quest";
export const GITHUB_QUEST_REWARD_SOURCE = "code_quest";
export const COMMUNITY_GITHUB_QUEST_ID = "github:community_issue_quest";
export const COMMUNITY_GITHUB_QUEST_LABEL = "POLLEN-QUEST";
export const GITHUB_QUEST_DEFAULT_BALANCE_BUCKET = "pack" satisfies Bucket;
export const GITHUB_QUEST_PAYOUT_SCOPE =
    "once_per_event_per_user" satisfies PayoutScope;

export const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    rewardAmount: number;
    balanceBucket: Bucket;
    payoutScope: PayoutScope;
    catalogMode?: "definition" | "instances";
};

export type RewardProposal = {
    userId: string;
    idempotencyKey?: string;
    eventId?: string;
    sourceRef?: string | null;
    source?: string;
    amount?: number;
    bucket?: Bucket;
    metadata?: Record<string, unknown> | null;
};

export function questUserKeyPrefix(
    definition: Pick<QuestDefinition, "id">,
): string {
    return `quest:${definition.id}:user:`;
}

export function buildRewardKey(
    definition: QuestDefinition,
    proposal: RewardProposal,
): string {
    if (proposal.idempotencyKey) {
        return proposal.idempotencyKey;
    }

    const baseKey = `${questUserKeyPrefix(definition)}${proposal.userId}`;

    switch (definition.payoutScope) {
        case "once_per_user":
            return baseKey;
        case "once_per_event_per_user":
            if (!proposal.eventId) {
                throw new Error(
                    `Quest ${definition.id} requires eventId for payoutScope ${definition.payoutScope}`,
                );
            }
            return `${baseKey}:event:${proposal.eventId}`;
        default:
            definition.payoutScope satisfies never;
            throw new Error(
                `Unsupported payoutScope for quest ${definition.id}`,
            );
    }
}

export function parseQuestReward(body: string): number | null {
    const match = body.match(QUEST_REWARD_REGEX);
    return match ? Number(match[1]) : null;
}

export function buildGitHubQuestRewardKey({
    issueNumber,
}: {
    issueNumber: number;
}): string {
    return `quest:${issueNumber}`;
}
