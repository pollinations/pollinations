import { sql } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    type QuestUser,
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
 * The SQL decides whether the current user qualifies. The rewards table is the
 * single idempotency layer, so quest code does not filter already rewarded
 * users.
 */

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: QuestDefinition = {
    id: "onboarding:first_api_key",
    title: "Create your first API key",
    description:
        "Create an API key in [Keys](#keys), then use it to make authenticated Pollinations requests from an app or script.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const byopLoginQuest: QuestDefinition = {
    id: "setup:byop_login",
    title: "Connect a Pollinations app",
    description:
        "Authorize a Pollinations-powered app with your account. You can review connected keys in [Keys](#keys).",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const firstTopUpQuest: QuestDefinition = {
    id: "spend:first_top_up",
    title: "Buy your first Pollen pack",
    description:
        "Add paid Pollen from [Top-up](#buy-pollen) so your projects can keep running after tier credits are spent.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

const overHundredPollenQuest: QuestDefinition = {
    id: "spend:purchased_over_100_pollen",
    title: "Power up with 100+ Pollen",
    description:
        "Purchase more than 100 total Pollen through [Top-up](#buy-pollen) and unlock a larger quest reward.",
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

export async function findRewardProposalsForUser(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const apiKeyRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
        LIMIT 1`,
    );
    const topUpRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        WHERE stripe_checkout_credits.user_id = ${user.id}
        LIMIT 1`,
    );
    const overHundredPollenRows = await db.all<SetupQuestRow>(
        sql`
        SELECT stripe_checkout_credits.user_id AS userId
        FROM stripe_checkout_credits
        WHERE stripe_checkout_credits.user_id = ${user.id}
        GROUP BY stripe_checkout_credits.user_id
        HAVING SUM(stripe_checkout_credits.pollen_credited) > 100
        LIMIT 1`,
    );
    const byopLoginRows = await db.all<SetupQuestRow>(
        sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
          AND apikey.byop_client_key_id IS NOT NULL
        LIMIT 1`,
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
