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
 *   - first_top_up   -> checkout credit ledgers (one recent paid checkout)
 *   - top_up_100     -> checkout credit ledgers (>=100 recent paid Pollen)
 *
 * The SQL decides whether the current user qualifies. The rewards table is the
 * single idempotency layer, so quest code does not filter already rewarded
 * users.
 */

type SetupQuestRow = {
    userId: string;
};

type TopUpSummaryRow = SetupQuestRow & {
    totalPollen: number;
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
    title: "Top up Pollen",
    description: "[Top up](#buy-pollen) Pollen in the last 30 days.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
};

const overHundredPollenQuest: QuestDefinition = {
    id: "top_up_100",
    title: "Top up 100 Pollen",
    description:
        "[Top up](#buy-pollen) 100 Pollen or more in the last 30 days.",
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
    const [apiKeyRows, topUpSummaryRows, byopLoginRows, sixMonthAccountRows] =
        await Promise.all([
            rewardableQuestIds.has(firstApiKeyQuest.id)
                ? db.all<SetupQuestRow>(sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
        LIMIT 1`)
                : [],
            rewardableQuestIds.has(firstTopUpQuest.id) ||
            rewardableQuestIds.has(overHundredPollenQuest.id)
                ? db.all<TopUpSummaryRow>(sql`
        WITH cutoff AS (
          SELECT
            CAST(strftime('%s', 'now', '-30 days') AS integer) AS seconds,
            CAST(strftime('%s', 'now', '-30 days') AS integer) * 1000 AS millis
        )
        SELECT userId
             , SUM(pollenCredited) AS totalPollen
        FROM (
          SELECT stripe_checkout_credits.user_id AS userId,
                 stripe_checkout_credits.pollen_credited AS pollenCredited
          FROM stripe_checkout_credits, cutoff
          WHERE stripe_checkout_credits.user_id = ${user.id}
            AND (
              (
                stripe_checkout_credits.created_at > 100000000000
                AND stripe_checkout_credits.created_at >= cutoff.millis
              )
              OR (
                stripe_checkout_credits.created_at <= 100000000000
                AND stripe_checkout_credits.created_at >= cutoff.seconds
              )
            )
          UNION ALL
          SELECT polar_checkout_credits.user_id AS userId,
                 polar_checkout_credits.pollen_credited AS pollenCredited
          FROM polar_checkout_credits, cutoff
          WHERE polar_checkout_credits.user_id = ${user.id}
            AND (
              (
                polar_checkout_credits.created_at > 100000000000
                AND polar_checkout_credits.created_at >= cutoff.millis
              )
              OR (
                polar_checkout_credits.created_at <= 100000000000
                AND polar_checkout_credits.created_at >= cutoff.seconds
              )
            )
        )
        GROUP BY userId
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
        ...(rewardableQuestIds.has(firstTopUpQuest.id) &&
        topUpSummaryRows.length > 0
            ? [
                  {
                      quest: firstTopUpQuest,
                      userId: topUpSummaryRows[0].userId,
                  },
              ]
            : []),
        ...(rewardableQuestIds.has(overHundredPollenQuest.id) &&
        (topUpSummaryRows[0]?.totalPollen ?? 0) >= 100
            ? [
                  {
                      quest: overHundredPollenQuest,
                      userId: topUpSummaryRows[0].userId,
                  },
              ]
            : []),
    ];
}
