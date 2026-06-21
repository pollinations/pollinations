import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;

type WeeklyTopUpQuestRow = {
    userId: string;
    weekKey: string;
    purchaseCount: number;
    sourceRef: string | null;
};

export const weeklyTopUpsQuest = {
    definition: {
        id: "spend:weekly_three_top_ups",
        title: "Top up three times this week",
        description: "Buy Pollen three times in the same week.",
        rewardAmount: 1,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
} satisfies QuestModule;

const GRANT_KEY_PREFIX = `quest:${weeklyTopUpsQuest.definition.id}:user:`;

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<WeeklyTopUpQuestRow>(
        sql`
        WITH weekly_top_ups AS (
            SELECT
                stripe_checkout_credits.user_id AS userId,
                strftime(
                    '%Y-W%W',
                    datetime(stripe_checkout_credits.created_at / 1000, 'unixepoch')
                ) AS weekKey,
                COUNT(*) AS purchaseCount,
                MIN(stripe_checkout_credits.session_id) AS sourceRef
            FROM stripe_checkout_credits
            WHERE strftime(
                    '%Y-W%W',
                    datetime(stripe_checkout_credits.created_at / 1000, 'unixepoch')
                ) = strftime('%Y-W%W', 'now')
            GROUP BY stripe_checkout_credits.user_id, weekKey
            HAVING COUNT(*) >= 3
        )
        SELECT
            weekly_top_ups.userId AS userId,
            weekly_top_ups.weekKey AS weekKey,
            weekly_top_ups.purchaseCount AS purchaseCount,
            weekly_top_ups.sourceRef AS sourceRef
        FROM weekly_top_ups
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${GRANT_KEY_PREFIX} ||
                weekly_top_ups.userId ||
                ${":week:"} ||
                weekly_top_ups.weekKey
        WHERE reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        idempotencyKey: `${GRANT_KEY_PREFIX}${row.userId}:week:${row.weekKey}`,
        userId: row.userId,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        questId: weeklyTopUpsQuest.definition.id,
        amount: weeklyTopUpsQuest.definition.rewardAmount,
        bucket: weeklyTopUpsQuest.definition.balanceBucket,
        sourceRef: row.sourceRef,
        metadata: {
            title: weeklyTopUpsQuest.definition.title,
            week: row.weekKey,
            purchaseCount: row.purchaseCount,
        },
    }));
}
