import { sql } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * D1 setup group: account-setup quests sourced from D1 source tables.
 *   - first_api_key  -> apikey                    (one key per user)
 *   - byop_login     -> apikey.byop_client_key_id (one BYOP login per user)
 *   - first_top_up   -> stripe_checkout_credits   (one paid checkout per user)
 *
 * The SQL decides which users qualify and returns reward proposals. It does
 * not join rewards and does not dedup — recordReward is the idempotent write
 * path.
 */

const MAX_REWARDS_PER_RUN = 500;

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: QuestDefinition = {
    id: "onboarding:first_api_key",
    title: "Create your first API key",
    description:
        "Create an API key for using Pollinations from an app or script.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const byopLoginQuest: QuestDefinition = {
    id: "setup:byop_login",
    title: "Logged in to a Pollinations app",
    description: "Authorize a Pollinations app to spend your Pollen.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const firstTopUpQuest: QuestDefinition = {
    id: "spend:first_top_up",
    title: "First pollen purchase",
    description: "Buy your first Pollen pack.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [firstApiKeyQuest, byopLoginQuest, firstTopUpQuest].map((quest) =>
        questToCard(quest),
    );
}

export async function findRewardProposals({
    db,
}: QuestEvaluationContext): Promise<RewardProposal[]> {
    const apiKeyRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        GROUP BY apikey.user_id
        LIMIT ${MAX_REWARDS_PER_RUN}`,
    );
    const topUpRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        GROUP BY stripe_checkout_credits.user_id
        LIMIT ${MAX_REWARDS_PER_RUN}`,
    );
    const byopLoginRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.byop_client_key_id IS NOT NULL
        GROUP BY apikey.user_id
        LIMIT ${MAX_REWARDS_PER_RUN}`,
    );

    return [
        ...apiKeyRows.map((row) => ({
            quest: firstApiKeyQuest,
            userId: row.userId,
        })),
        ...byopLoginRows.map((row) => ({
            quest: byopLoginQuest,
            userId: row.userId,
        })),
        ...topUpRows.map((row) => ({
            quest: firstTopUpQuest,
            userId: row.userId,
        })),
    ];
}
