import type { RecordRewardInput } from "@shared/billing/rewards.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { QuestDefinition, QuestState } from "./definitions.ts";

export type QuestDb = DrizzleD1Database<typeof schema>;

export type QuestEvaluationContext = {
    db: QuestDb;
    env: CloudflareBindings;
};

export type QuestUser = {
    id: string;
    githubId: number | null;
    githubUsername: string | null;
};

export type QuestGroup = {
    id: string;
    listQuestCards(ctx: QuestEvaluationContext): Promise<QuestCard[]>;
    findRewardProposalsForUser(
        ctx: QuestEvaluationContext,
        user: QuestUser,
    ): Promise<RewardProposal[]>;
};

export type RewardProposal = {
    quest: QuestDefinition;
    userId: string;
};

export function toReward(proposal: RewardProposal): RecordRewardInput {
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
    const { scope: _scope, url, state, ...definition } = quest;
    return {
        ...definition,
        state: state ?? "available",
        url: url ?? null,
    };
}

export type QuestCard = Omit<QuestDefinition, "url" | "scope" | "state"> & {
    state: QuestState;
    url: string | null;
};
