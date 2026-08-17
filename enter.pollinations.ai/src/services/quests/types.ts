import type { RecordRewardInput } from "@shared/billing/rewards.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    type QuestDefinition,
    type QuestState,
    questState,
} from "./definitions.ts";

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
    idempotencySubject?: string;
};

export function toReward(
    proposal: RewardProposal,
    githubId: number | null,
): RecordRewardInput {
    const { quest, userId } = proposal;
    let idempotencyKey: string;
    if (quest.scope === "once") {
        idempotencyKey = `quest:${quest.id}`;
    } else if (quest.scope === "perSubject") {
        if (!proposal.idempotencySubject) {
            throw new Error(
                `Quest ${quest.id} requires an idempotency subject`,
            );
        }
        idempotencyKey = `quest:${quest.id}:${proposal.idempotencySubject}`;
    } else {
        // GitHub OAuth users always have githubId. Keep the user-id fallback
        // for legacy/internal rows that predate the GitHub field.
        idempotencyKey =
            githubId === null
                ? `quest:${quest.id}:user:${userId}`
                : `quest:${quest.id}:github:${githubId}`;
    }
    return {
        idempotencyKey,
        githubId,
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
        state: questState({ state }),
        url: url ?? null,
    };
}

export type QuestCard = Omit<QuestDefinition, "url" | "scope" | "state"> & {
    state: QuestState;
    url: string | null;
};
