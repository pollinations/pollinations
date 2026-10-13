import { sql } from "drizzle-orm";
import { type QuestDefinition, rewardableQuests } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
    toQuestProgress,
} from "../types.ts";

/**
 * D1 setup group: account-setup quests sourced from D1 source tables.
 *   - first_api_key  -> apikey                    (one key per user)
 *   - use_app        -> apikey.byop_client_key_id (one BYOP login per user)
 *   - connect_polli_cli -> apikey.byop_client_key_id (Polli device login,
 *                          account 3+ days old)
 *   - early_adopter  -> user.created_at           (registered 9+ months ago)
 *   - top_up_since_launch -> stripe_checkout_credits (one launch-era checkout)
 *   - top_up_100_since_launch -> stripe_checkout_credits (>=100 launch-era Pollen)
 *   - first_auto_top_up -> stripe_auto_top_up_attempt (first paid auto top-up
 *                          on or after the quest's launch)
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

const QUEST_REWARDS_LAUNCH_DATE_LABEL = "21/06/26";
const QUEST_REWARDS_LAUNCH_CUTOFF_SECONDS = 1_782_000_000; // 2026-06-21T00:00:00Z
const QUEST_REWARDS_LAUNCH_CUTOFF_MILLIS =
    QUEST_REWARDS_LAUNCH_CUTOFF_SECONDS * 1000;
const TIMESTAMP_MILLIS_THRESHOLD = 100_000_000_000;
// Users who already had a paid auto top-up before this date don't qualify.
const AUTO_TOP_UP_QUEST_LAUNCH_DATE_LABEL = "13/10/26";
const AUTO_TOP_UP_QUEST_LAUNCH_MILLIS = Date.parse("2026-10-13T00:00:00Z");

const firstApiKeyQuest: QuestDefinition = {
    id: "first_api_key",
    title: "Create your first API key",
    description: "Create an API [key](/keys).",
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
};

// ID of Polli's publishable app key (the client_id in polli auth login).
const POLLI_CLIENT_KEY_ID = "jF3QOFUCn0ipcgRqkTU2kiSFMwZtm7v0";

const connectPolliCliQuest: QuestDefinition = {
    id: "connect_polli_cli",
    title: "Connect Polli CLI",
    description:
        "Install the [Polli CLI](https://www.npmjs.com/package/@pollinations/cli) and connect your account with `polli auth login`. Your account must be at least 3 days old.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 1,
    balanceBucket: "tier",
};

const earlyAdopterQuest: QuestDefinition = {
    id: "early_adopter",
    title: "Early adopter",
    description: "Your Pollinations account is at least nine months old.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
    state: "coming_soon",
};

const legacyFirstTopUpQuest: QuestDefinition = {
    id: "first_top_up",
    title: "First Pollen top up",
    description: "[Top up](/pollen#buy-pollen) Pollen.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
    state: "completed",
};

const legacyOverHundredPollenQuest: QuestDefinition = {
    id: "top_up_100",
    title: "Top up 100 Pollen",
    description:
        "You have [topped up](/pollen#buy-pollen) 100 Pollen or more in total.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 50,
    balanceBucket: "tier",
    state: "completed",
};

const topUpSinceLaunchQuest: QuestDefinition = {
    id: "top_up_since_launch",
    title: "Top up Pollen",
    description: `[Top up](/pollen#buy-pollen) Pollen. _(from ${QUEST_REWARDS_LAUNCH_DATE_LABEL})_`,
    category: "grow",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

const overHundredPollenSinceLaunchQuest = {
    id: "top_up_100_since_launch",
    title: "Top up 100 Pollen",
    description: `You have [topped up](/pollen#buy-pollen) 100 Pollen or more. _(from ${QUEST_REWARDS_LAUNCH_DATE_LABEL})_`,
    category: "grow",
    scope: "perUser",
    rewardAmount: 50,
    balanceBucket: "tier",
    goal: { target: 100, unit: "pollen" },
} satisfies QuestDefinition;

const firstAutoTopUpQuest: QuestDefinition = {
    id: "first_auto_top_up",
    title: "First auto top-up",
    description: `Turn on [auto top-up](/pollen#buy-pollen) for the first time and complete one paid auto top-up. _(from ${AUTO_TOP_UP_QUEST_LAUNCH_DATE_LABEL})_`,
    category: "grow",
    scope: "perUser",
    rewardAmount: 20,
    balanceBucket: "tier",
};

/** Quests earned by buying Pollen; the monthly standings mark their earners. */
export const TOP_UP_QUEST_IDS = [
    legacyFirstTopUpQuest.id,
    legacyOverHundredPollenQuest.id,
    topUpSinceLaunchQuest.id,
    overHundredPollenSinceLaunchQuest.id,
    firstAutoTopUpQuest.id,
];

const QUESTS = [
    firstApiKeyQuest,
    byopLoginQuest,
    connectPolliCliQuest,
    earlyAdopterQuest,
    legacyFirstTopUpQuest,
    legacyOverHundredPollenQuest,
    topUpSinceLaunchQuest,
    overHundredPollenSinceLaunchQuest,
    firstAutoTopUpQuest,
];

const EVALUATED_QUESTS = [
    firstApiKeyQuest,
    byopLoginQuest,
    connectPolliCliQuest,
    earlyAdopterQuest,
    topUpSinceLaunchQuest,
    overHundredPollenSinceLaunchQuest,
    firstAutoTopUpQuest,
];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function evaluateUser(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const rewardableQuestIds = new Set(
        rewardableQuests(EVALUATED_QUESTS).map((quest) => quest.id),
    );
    const [
        apiKeyRows,
        topUpSummaryRows,
        byopLoginRows,
        polliCliRows,
        earlyAdopterRows,
        autoTopUpRows,
    ] = await Promise.all([
        rewardableQuestIds.has(firstApiKeyQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        WHERE apikey.user_id = ${user.id}
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(topUpSinceLaunchQuest.id) ||
        rewardableQuestIds.has(overHundredPollenSinceLaunchQuest.id)
            ? db.all<TopUpSummaryRow>(sql`
        SELECT stripe_checkout_credits.user_id AS userId,
               SUM(stripe_checkout_credits.pollen_credited) AS totalPollen
        FROM stripe_checkout_credits
        WHERE stripe_checkout_credits.user_id = ${user.id}
          AND (
            (
              stripe_checkout_credits.created_at > ${TIMESTAMP_MILLIS_THRESHOLD}
              AND stripe_checkout_credits.created_at >= ${QUEST_REWARDS_LAUNCH_CUTOFF_MILLIS}
            )
            OR (
              stripe_checkout_credits.created_at <= ${TIMESTAMP_MILLIS_THRESHOLD}
              AND stripe_checkout_credits.created_at >= ${QUEST_REWARDS_LAUNCH_CUTOFF_SECONDS}
            )
          )
        GROUP BY stripe_checkout_credits.user_id
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
        // The age floor stops fresh accounts from farming the reward;
        // newer accounts earn it once they turn 3 days old.
        rewardableQuestIds.has(connectPolliCliQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT apikey.user_id AS userId
        FROM apikey
        JOIN "user" ON "user".id = apikey.user_id
        WHERE apikey.user_id = ${user.id}
          AND apikey.byop_client_key_id = ${POLLI_CLIENT_KEY_ID}
          AND "user".created_at <= CAST(strftime('%s', 'now', '-3 days') AS integer)
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(earlyAdopterQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT "user".id AS userId
        FROM "user"
        WHERE "user".id = ${user.id}
          AND "user".created_at <= CAST(strftime('%s', 'now', '-9 months') AS integer)
        LIMIT 1`)
            : [],
        rewardableQuestIds.has(firstAutoTopUpQuest.id)
            ? db.all<SetupQuestRow>(sql`
        SELECT stripe_auto_top_up_attempt.user_id AS userId
        FROM stripe_auto_top_up_attempt
        WHERE stripe_auto_top_up_attempt.user_id = ${user.id}
          AND stripe_auto_top_up_attempt.status = 'paid'
        GROUP BY stripe_auto_top_up_attempt.user_id
        HAVING MIN(stripe_auto_top_up_attempt.created_at) >= ${AUTO_TOP_UP_QUEST_LAUNCH_MILLIS}`)
            : [],
    ]);

    const totalPollen = topUpSummaryRows[0]?.totalPollen ?? 0;
    const proposals = [
        ...apiKeyRows.map((row) => ({
            quest: firstApiKeyQuest,
            userId: row.userId,
        })),
        ...byopLoginRows.map((row) => ({
            quest: byopLoginQuest,
            userId: row.userId,
        })),
        ...polliCliRows.map((row) => ({
            quest: connectPolliCliQuest,
            userId: row.userId,
        })),
        ...earlyAdopterRows.map((row) => ({
            quest: earlyAdopterQuest,
            userId: row.userId,
        })),
        ...autoTopUpRows.map((row) => ({
            quest: firstAutoTopUpQuest,
            userId: row.userId,
        })),
        ...(rewardableQuestIds.has(topUpSinceLaunchQuest.id) &&
        topUpSummaryRows.length > 0
            ? [
                  {
                      quest: topUpSinceLaunchQuest,
                      userId: topUpSummaryRows[0].userId,
                  },
              ]
            : []),
        ...(rewardableQuestIds.has(overHundredPollenSinceLaunchQuest.id) &&
        totalPollen >= overHundredPollenSinceLaunchQuest.goal.target
            ? [
                  {
                      quest: overHundredPollenSinceLaunchQuest,
                      userId: topUpSummaryRows[0].userId,
                  },
              ]
            : []),
    ];

    return {
        proposals,
        progress: [
            toQuestProgress(overHundredPollenSinceLaunchQuest, totalPollen),
        ],
    };
}
