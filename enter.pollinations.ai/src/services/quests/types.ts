import { type RecordRewardInput, rewardKey } from "@shared/billing/rewards.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
    type QuestDefinition,
    type QuestGoal,
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
    /** Google account id (`sub`) for users who signed in with Google. */
    googleId?: string | null;
};

export type QuestGroup = {
    id: string;
    listQuestCards(ctx: QuestEvaluationContext): Promise<QuestCard[]>;
    evaluateUser(
        ctx: QuestEvaluationContext,
        user: QuestUser,
    ): Promise<QuestEvaluation>;
};

export type RewardProposal = {
    quest: QuestDefinition;
    userId: string;
    /** Replaces the scope-derived key, e.g. to pay once per Discord account. */
    idempotencyKey?: string;
};

export type QuestProgress = QuestGoal & {
    questId: string;
    current: number;
};

export type QuestEvaluation = {
    proposals: RewardProposal[];
    progress?: QuestProgress[];
};

export function toQuestProgress(
    quest: QuestDefinition & { goal: QuestGoal },
    current: number,
): QuestProgress {
    return { questId: quest.id, current, ...quest.goal };
}

export function toReward(
    proposal: RewardProposal,
    user: QuestUser,
): RecordRewardInput {
    const { quest, userId } = proposal;
    return {
        idempotencyKey:
            proposal.idempotencyKey ??
            (quest.scope === "once"
                ? `quest:${quest.id}`
                : rewardKey(quest.id, user)),
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
