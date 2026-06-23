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
 *   - first_top_up   -> stripe_checkout_credits   (one paid checkout per user)
 *
 * The SQL decides which users qualify and returns reward proposals. It does
 * not join reward_grants and does not dedup — grantReward is the idempotent
 * write path.
 */

const MAX_GRANTS_PER_RUN = 500;

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: QuestDefinition = {
    id: "onboarding:first_api_key",
    title: "Mint your first key",
    description: "Create your first Pollinations API key.",
    iconId: "key",
    category: "plant",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
};

const firstTopUpQuest: QuestDefinition = {
    id: "spend:first_top_up",
    title: "Stock your pollen pack",
    description: "Buy your first Pollen pack.",
    iconId: "card",
    category: "grow",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "pack",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [firstApiKeyQuest, firstTopUpQuest].map((quest) =>
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
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );
    const topUpRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        GROUP BY stripe_checkout_credits.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return [
        ...apiKeyRows.map((row) => ({
            quest: firstApiKeyQuest,
            userId: row.userId,
        })),
        ...topUpRows.map((row) => ({
            quest: firstTopUpQuest,
            userId: row.userId,
        })),
    ];
}
