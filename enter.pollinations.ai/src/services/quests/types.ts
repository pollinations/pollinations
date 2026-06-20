import type { Bucket } from "@shared/billing/deduction.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type {
    PayoutScope,
    QuestDefinition,
    RewardProposal,
} from "@shared/quests/definitions.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export type QuestDb = DrizzleD1Database<typeof schema>;

export type QuestEvaluationContext = {
    db: QuestDb;
    env: CloudflareBindings;
};

export type QuestInstanceContext = {
    db: QuestDb;
};

export type QuestInstance = {
    id: string;
    kind: "product" | "github_issue";
    questTypeId: string;
    title: string;
    description: string;
    availability: "available" | "claimed" | "completed";
    rewardAmount: number | null;
    rewardText: string | null;
    balanceBucket: Bucket;
    payoutScope: PayoutScope;
    url: string | null;
    issueNumber: number | null;
    assignees: string[];
    labels: string[];
    createdAt: string | null;
    updatedAt: string | null;
    closedAt: string | null;
};

export type QuestModule = {
    definition: QuestDefinition;
    evaluate(context: QuestEvaluationContext): Promise<RewardProposal[]>;
    instances?(context: QuestInstanceContext): Promise<QuestInstance[]>;
};

export function definitionQuestInstance(
    definition: QuestDefinition,
): QuestInstance {
    return {
        id: definition.id,
        kind: "product",
        questTypeId: definition.id,
        title: definition.title,
        description: definition.description,
        availability: "available",
        rewardAmount: definition.rewardAmount,
        rewardText: `${definition.rewardAmount} Pollen`,
        balanceBucket: definition.balanceBucket,
        payoutScope: definition.payoutScope,
        url: null,
        issueNumber: null,
        assignees: [],
        labels: [],
        createdAt: null,
        updatedAt: null,
        closedAt: null,
    };
}
