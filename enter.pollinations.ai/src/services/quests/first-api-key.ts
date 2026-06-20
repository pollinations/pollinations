import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;
type FirstApiKeyQuestRow = {
    userId: string;
    sourceRef: string | null;
};

export const firstApiKeyQuest = {
    definition: {
        id: "onboarding:first_api_key",
        title: "Mint your first key",
        description: "Create your first Pollinations API key.",
        rewardAmount: 1,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${firstApiKeyQuest.definition.id}:user:`;

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<FirstApiKeyQuestRow>(
        sql`
        SELECT
            apikey.user_id AS userId,
            MIN(apikey.id) AS sourceRef
        FROM apikey
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${USER_KEY_PREFIX} || apikey.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY apikey.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
        userId: row.userId,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        questId: firstApiKeyQuest.definition.id,
        amount: firstApiKeyQuest.definition.rewardAmount,
        bucket: firstApiKeyQuest.definition.balanceBucket,
        sourceRef: row.sourceRef,
        metadata: {
            title: firstApiKeyQuest.definition.title,
        },
    }));
}
