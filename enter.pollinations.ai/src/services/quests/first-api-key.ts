import type { RewardProposal } from "@shared/quests/definitions.ts";
import { questUserKeyPrefix } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;

export const firstApiKeyQuest = {
    definition: {
        id: "onboarding:first_api_key",
        title: "Mint your first key",
        description: "Create your first Pollinations API key.",
        rewardAmount: 1,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    async evaluate({ db }) {
        return findRewardProposals(db);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = questUserKeyPrefix(firstApiKeyQuest.definition);

async function findRewardProposals(db: QuestDb): Promise<RewardProposal[]> {
    return await db.all<RewardProposal>(
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
}
