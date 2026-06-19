import type { Bucket } from "../billing/deduction.ts";

export type QuestCategory = "onboarding" | "spend" | "build";
export type QuestEventType =
    | "api_key_created"
    | "first_top_up"
    | "github_account_age"
    | "github_pr_merged";
export type PayoutScope = "once_per_user" | "once_per_event_per_user";

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    category: QuestCategory;
    eventType: QuestEventType;
    rewardAmount: number;
    balanceBucket: Bucket;
    payoutScope: PayoutScope;
};

export type GrantCandidate = {
    userId: string;
    eventId?: string;
    sourceRef?: string | null;
    metadata?: Record<string, unknown> | null;
};

export const QUEST_DEFINITIONS: QuestDefinition[] = [
    {
        id: "onboarding:first_api_key",
        title: "Mint your first key",
        description: "Create your first Pollinations API key.",
        category: "onboarding",
        eventType: "api_key_created",
        rewardAmount: 1,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    {
        id: "spend:first_top_up",
        title: "Stock your pollen pack",
        description: "Buy your first Pollen pack.",
        category: "spend",
        eventType: "first_top_up",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    {
        id: "onboarding:established_github_account",
        title: "Claim senior dev status",
        description: "Connect a GitHub account that is at least one year old.",
        category: "onboarding",
        eventType: "github_account_age",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
];

export function getQuestDefinition(id: string): QuestDefinition | undefined {
    return QUEST_DEFINITIONS.find((quest) => quest.id === id);
}

export function buildGrantKey(
    definition: QuestDefinition,
    candidate: GrantCandidate,
): string {
    const baseKey = `quest:${definition.id}:user:${candidate.userId}`;

    switch (definition.payoutScope) {
        case "once_per_user":
            return baseKey;
        case "once_per_event_per_user":
            if (!candidate.eventId) {
                throw new Error(
                    `Quest ${definition.id} requires eventId for payoutScope ${definition.payoutScope}`,
                );
            }
            return `${baseKey}:event:${candidate.eventId}`;
        default:
            definition.payoutScope satisfies never;
            throw new Error(
                `Unsupported payoutScope for quest ${definition.id}`,
            );
    }
}
