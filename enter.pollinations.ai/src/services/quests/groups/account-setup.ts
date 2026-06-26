import { sql } from "drizzle-orm";
import { type QuestDefinition, rewardableQuests } from "../definitions.ts";
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
 *   - use_app        -> apikey.byop_client_key_id (one BYOP login per user)
 *   - early_adopter  -> user.created_at           (registered 6+ months ago)
 *   - first_top_up   -> checkout credit ledgers (one paid checkout per user)
 *   - top_up_100     -> checkout credit ledgers (>=100 total paid Pollen)
 *
 * The SQL decides whether the current user qualifies. The rewards table is the
 * single idempotency layer, so quest code does not filter already rewarded
 * users.
 */

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: QuestDefinition = {
    id: "first_api_key",
    title: "Create your first API key",
    description: "Create an API [key](#keys).",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const byopLoginQuest: QuestDefinition = {
    id: "use_app",
    title: "Use a Pollinations app",
    description:
        "Connect to a Pollinations app. Log in to any app in the [apps directory](https://pollinations.ai/apps) that supports it.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const sixMonthAccountQuest: QuestDefinition = {
    id: "early_adopter",
    title: "Early Pollinations adopter",
    description: "Your Pollinations account is older than six months.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const firstTopUpQuest: QuestDefinition = {
    id: "first_top_up",
    title: "First Pollen top up",
    description: "[Top up](#buy-pollen) Pollen with a credit card.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
};

const overHundredPollenQuest: QuestDefinition = {
    id: "top_up_100",
    title: "Top up 100 Pollen",
    description:
        "You have [topped up](#buy-pollen) 100 Pollen or more in total.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 50,
    balanceBucket: "tier",
};

const QUESTS = [
    firstApiKeyQuest,
    byopLoginQuest,
    sixMonthAccountQuest,
    firstTopUpQuest,
    overHundredPollenQuest,
];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposalsForUser(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const rewardableQuestIds = new Set(
        rewardableQuests(QUESTS).map((quest) => quest.id),
    );
    const [
        apiKeyRows,
        topUpRows,
        overHundredPollenRows,
        byopLoginRows,
        sixMonthAccountRows,
    ] = await Promise.all([
        rewardableQuestIds.has(firstApiKeyQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(firstTopUpQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT userId
        FROM (
          SELECT stripe_checkout_credits.user_id AS userId
          FROM stripe_checkout_credits
          WHERE stripe_checkout_credits.user_id = ${user.id}
          UNION ALL
          SELECT polar_checkout_credits.user_id AS userId
          FROM polar_checkout_credits
          WHERE polar_checkout_credits.user_id = ${user.id}
        )
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(overHundredPollenQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT userId
        FROM (
          SELECT stripe_checkout_credits.user_id AS userId,
                 stripe_checkout_credits.pollen_credited AS pollenCredited
          FROM stripe_checkout_credits
          WHERE stripe_checkout_credits.user_id = ${user.id}
          UNION ALL
          SELECT polar_checkout_credits.user_id AS userId,
                 polar_checkout_credits.pollen_credited AS pollenCredited
          FROM polar_checkout_credits
          WHERE polar_checkout_credits.user_id = ${user.id}
        )
        GROUP BY userId
        HAVING SUM(pollenCredited) >= 100
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(byopLoginQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
          AND apikey.byop_client_key_id IS NOT NULL
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(sixMonthAccountQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT "user".id AS userId
        FROM "user"
        WHERE "user".id = ${user.id}
          AND "user".created_at <= CAST(strftime('%s', 'now', '-6 months') AS integer)
        LIMIT 1`)
            : [],
    ]);

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
