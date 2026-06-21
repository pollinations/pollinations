import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;

type TopUpStreakRow = {
    userId: string;
    currentWeek: string;
    previousWeek: string;
    twoWeeksAgo: string;
    sourceRef: string | null;
};

export const topUpStreakQuest = {
    definition: {
        id: "spend:three_week_top_up_streak",
        title: "Top up for three weeks",
        description: "Buy Pollen at least once per week for three weeks.",
        rewardAmount: 3,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
} satisfies QuestModule;

const GRANT_KEY_PREFIX = `quest:${topUpStreakQuest.definition.id}:user:`;

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<TopUpStreakRow>(
        sql`
        WITH week_keys AS (
            SELECT
                strftime('%Y-W%W', 'now') AS currentWeek,
                strftime('%Y-W%W', 'now', '-7 days') AS previousWeek,
                strftime('%Y-W%W', 'now', '-14 days') AS twoWeeksAgo
        ),
        weekly_top_ups AS (
            SELECT
                stripe_checkout_credits.user_id AS userId,
                strftime(
                    '%Y-W%W',
                    datetime(stripe_checkout_credits.created_at / 1000, 'unixepoch')
                ) AS weekKey,
                MIN(stripe_checkout_credits.session_id) AS sourceRef
            FROM stripe_checkout_credits
            GROUP BY stripe_checkout_credits.user_id, weekKey
        )
        SELECT
            current.userId AS userId,
            week_keys.currentWeek AS currentWeek,
            week_keys.previousWeek AS previousWeek,
            week_keys.twoWeeksAgo AS twoWeeksAgo,
            current.sourceRef AS sourceRef
        FROM week_keys
        INNER JOIN weekly_top_ups current
            ON current.weekKey = week_keys.currentWeek
        INNER JOIN weekly_top_ups previous
            ON previous.userId = current.userId
            AND previous.weekKey = week_keys.previousWeek
        INNER JOIN weekly_top_ups older
            ON older.userId = current.userId
            AND older.weekKey = week_keys.twoWeeksAgo
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${GRANT_KEY_PREFIX} ||
                current.userId ||
                ${":week:"} ||
                week_keys.currentWeek
        WHERE reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        idempotencyKey: `${GRANT_KEY_PREFIX}${row.userId}:week:${row.currentWeek}`,
        userId: row.userId,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        questId: topUpStreakQuest.definition.id,
        amount: topUpStreakQuest.definition.rewardAmount,
        bucket: topUpStreakQuest.definition.balanceBucket,
        sourceRef: row.sourceRef,
        metadata: {
            title: topUpStreakQuest.definition.title,
            weeks: [row.twoWeeksAgo, row.previousWeek, row.currentWeek],
        },
    }));
}
