import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { QuestDefinition } from "@shared/quests/definitions.ts";
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
    kind: string;
    title: string;
    description: string;
    availability: "available" | "claimed" | "completed";
    rewardAmount: number | null;
    url: string | null;
    assignees?: string[];
    sortKey?: string;
};

export type QuestModule = {
    definition: QuestDefinition;
    evaluate(context: QuestEvaluationContext): Promise<GrantRewardInput[]>;
    instances?(context: QuestInstanceContext): Promise<QuestInstance[]>;
};

export function definitionQuestInstance(
    definition: QuestDefinition,
): QuestInstance {
    return {
        id: definition.id,
        kind: "product",
        title: definition.title,
        description: definition.description,
        availability: "available",
        rewardAmount: definition.rewardAmount,
        url: null,
    };
}
