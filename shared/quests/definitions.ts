import type { Bucket } from "../billing/deduction.ts";

export type PayoutScope = "once_per_user" | "once_per_event_per_user";

export const PRODUCT_QUEST_GRANT_SOURCE = "product_quest";
export const GITHUB_QUEST_GRANT_SOURCE = "code_quest";
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

export type GrantCandidate = {
    userId: string;
    idempotencyKey?: string;
    eventId?: string;
    sourceRef?: string | null;
    source?: string;
    amount?: number;
    bucket?: Bucket;
    metadata?: Record<string, unknown> | null;
};

export const QUEST_DEFINITIONS: QuestDefinition[] = [
    {
        id: "onboarding:first_api_key",
        title: "Mint your first key",
        description: "Create your first Pollinations API key.",
        rewardAmount: 1,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    {
        id: "spend:first_top_up",
        title: "Stock your pollen pack",
        description: "Buy your first Pollen pack.",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    {
        id: "onboarding:established_github_account",
        title: "Claim senior dev status",
        description: "Connect a GitHub account that is at least one year old.",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    {
        id: "grow:list_app_on_pollinations",
        title: "List an app on Pollinations",
        description: "Get an app approved for the Pollinations app directory.",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
    },
    {
        id: COMMUNITY_GITHUB_QUEST_ID,
        title: "Complete a GitHub quest issue",
        description: "Complete an open POLLEN-QUEST issue on GitHub.",
        rewardAmount: 0,
        balanceBucket: GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
        payoutScope: GITHUB_QUEST_PAYOUT_SCOPE,
        catalogMode: "instances",
    },
];

export function catalogDefinitionQuests(): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter(
        (quest) => (quest.catalogMode ?? "definition") === "definition",
    );
}

export function getQuestDefinition(id: string): QuestDefinition | undefined {
    return QUEST_DEFINITIONS.find((quest) => quest.id === id);
}

export function requireQuestDefinition(id: string): QuestDefinition {
    const definition = getQuestDefinition(id);
    if (!definition) {
        throw new Error(`Unknown quest definition: ${id}`);
    }
    return definition;
}

export function questUserKeyPrefix(
    definition: Pick<QuestDefinition, "id">,
): string {
    return `quest:${definition.id}:user:`;
}

export function buildGrantKey(
    definition: QuestDefinition,
    candidate: GrantCandidate,
): string {
    if (candidate.idempotencyKey) {
        return candidate.idempotencyKey;
    }

    const baseKey = `${questUserKeyPrefix(definition)}${candidate.userId}`;

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

export function parseQuestReward(body: string): number | null {
    const match = body.match(QUEST_REWARD_REGEX);
    return match ? Number(match[1]) : null;
}

export function buildGitHubQuestGrantKey({
    issueNumber,
    githubId,
    role = "assignee",
}: {
    issueNumber: number;
    githubId: number;
    role?: string;
}): string {
    return `quest:${issueNumber}:gh:${githubId}:role:${role}`;
}
