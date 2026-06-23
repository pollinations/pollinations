import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { QuestAvailability, QuestDefinition } from "./definitions.ts";

export type QuestDb = DrizzleD1Database<typeof schema>;

export type QuestEvaluationContext = {
    db: QuestDb;
    env: CloudflareBindings;
};

export type QuestGroup = {
    id: string;
    listQuestCards(ctx: QuestEvaluationContext): Promise<QuestCard[]>;
    findRewardProposals(ctx: QuestEvaluationContext): Promise<RewardProposal[]>;
};

export type RewardProposal = {
    quest: QuestDefinition;
    userId: string;
};

export function toGrant(proposal: RewardProposal): GrantRewardInput {
    const { quest, userId } = proposal;
    const idempotencyKey =
        quest.scope === "once"
            ? `quest:${quest.id}`
            : `quest:${quest.id}:user:${userId}`;
    return {
        idempotencyKey,
        userId,
        questId: quest.id,
        title: quest.title,
        url: quest.url ?? null,
        amount: quest.rewardAmount,
        bucket: quest.balanceBucket,
    };
}

export function questToCard(quest: QuestDefinition): QuestCard {
    const {
        balanceBucket: _bucket,
        scope: _scope,
        url,
        availability,
        ...definition
    } = quest;
    return {
        ...definition,
        availability: availability ?? "available",
        url: url ?? null,
    };
}

export type QuestCard = Omit<
    QuestDefinition,
    "rewardAmount" | "balanceBucket" | "url" | "scope" | "availability"
> & {
    availability: QuestAvailability;
    rewardAmount: number | null;
    url: string | null;
};
