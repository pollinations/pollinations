import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;
type FirstTopUpQuestRow = {
    userId: string;
    sourceRef: string | null;
};

export const firstTopUpQuest = {
    definition: {
        id: "spend:first_top_up",
        title: "Stock your pollen pack",
        description: "Buy your first Pollen pack.",
        rewardAmount: 5,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${firstTopUpQuest.definition.id}:user:`;

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<FirstTopUpQuestRow>(
        sql`
        SELECT
            stripe_checkout_credits.user_id AS userId,
            MIN(stripe_checkout_credits.session_id) AS sourceRef
        FROM stripe_checkout_credits
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${USER_KEY_PREFIX} || stripe_checkout_credits.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY stripe_checkout_credits.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
        userId: row.userId,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        questId: firstTopUpQuest.definition.id,
        amount: firstTopUpQuest.definition.rewardAmount,
        bucket: firstTopUpQuest.definition.balanceBucket,
        sourceRef: row.sourceRef,
        metadata: {
            title: firstTopUpQuest.definition.title,
        },
    }));
}
