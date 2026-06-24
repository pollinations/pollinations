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
 *   - over_100_pollen -> stripe_checkout_credits  (>100 total paid Pollen)
 *
 * The SQL decides which users qualify. The rewards table is the single
 * idempotency layer, so quest code does not filter already rewarded users.
 */

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: QuestDefinition = {
    id: "onboarding:first_api_key",
    title: "Create your first API key",
    description:
        "Create your first API [key](#keys) for using Pollinations from an app or script.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const byopLoginQuest: QuestDefinition = {
    id: "setup:byop_login",
    title: "Log in to a Pollinations app",
    description:
        "Authorize a Pollinations app with [BYOP](https://gen.pollinations.ai/docs#tag/byop).",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const firstTopUpQuest: QuestDefinition = {
    id: "spend:first_top_up",
    title: "Buy your first Pollen pack",
    description: "Buy your first Pollen [pack](#buy-pollen).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

const overHundredPollenQuest: QuestDefinition = {
    id: "spend:purchased_over_100_pollen",
    title: "Purchase more than 100 Pollen",
    description: "Buy more than 100 total [Pollen](#buy-pollen).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 50,
    balanceBucket: "tier",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [
        firstApiKeyQuest,
        byopLoginQuest,
        firstTopUpQuest,
        overHundredPollenQuest,
    ].map((quest) => questToCard(quest));
}

export async function findRewardProposals({
    db,
}: QuestEvaluationContext): Promise<RewardProposal[]> {
    const apiKeyRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        GROUP BY apikey.user_id
        ORDER BY apikey.user_id`,
    );
    const topUpRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        GROUP BY stripe_checkout_credits.user_id
        ORDER BY stripe_checkout_credits.user_id`,
    );
    const overHundredPollenRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        GROUP BY stripe_checkout_credits.user_id
        HAVING SUM(stripe_checkout_credits.pollen_credited) > 100
        ORDER BY stripe_checkout_credits.user_id`,
    );
    const byopLoginRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.byop_client_key_id IS NOT NULL
        GROUP BY apikey.user_id
        ORDER BY apikey.user_id`,
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
        ...overHundredPollenRows.map((row) => ({
            quest: overHundredPollenQuest,
            userId: row.userId,
        })),
    ];
}
