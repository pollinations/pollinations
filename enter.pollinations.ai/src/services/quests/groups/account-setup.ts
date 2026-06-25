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
 *   - six_month_account -> user.created_at        (registered 6+ months ago)
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
    description: "Create an API key in [Keys](#keys).",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const byopLoginQuest: QuestDefinition = {
    id: "setup:byop_login",
    title: "Login",
    description:
        "Connect to a Pollinations app. Log in to any app in the [apps directory](https://pollinations.ai/apps) that supports it.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const sixMonthAccountQuest: QuestDefinition = {
    id: "community:six_month_account",
    title: "Early Pollinations adopter",
    description:
        "Have a Pollinations account that was created at least six months ago.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const firstTopUpQuest: QuestDefinition = {
    id: "spend:first_top_up",
    title: "Top up with paid Pollen",
    description: "Top up with paid Pollen from [Top-up](#buy-pollen).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
};

const overHundredPollenQuest: QuestDefinition = {
    id: "spend:purchased_over_100_pollen",
    title: "Power up with more than 100 Pollen",
    description:
        "Purchase more than 100 total Pollen through [Top-up](#buy-pollen).",
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
        sixMonthAccountQuest,
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
    const sixMonthAccountRows = await db.all<SetupQuestRow>(
        sql`
        SELECT "user".id AS userId
        FROM "user"
        WHERE "user".id = ${user.id}
          AND "user".created_at <= CAST(strftime('%s', 'now', '-6 months') AS integer)
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
        ...sixMonthAccountRows.map((row) => ({
            quest: sixMonthAccountQuest,
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
