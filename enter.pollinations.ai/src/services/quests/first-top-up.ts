import type { RewardProposal } from "@shared/quests/definitions.ts";
import { questUserKeyPrefix } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;

export const firstTopUpQuest = {
    definition: {
        id: "spend:first_top_up",
        title: "Stock your pollen pack",
        description: "Buy your first Pollen pack.",
        rewardAmount: 5,
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    },
    async evaluate({ db }) {
        return findRewardProposals(db);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = questUserKeyPrefix(firstTopUpQuest.definition);

async function findRewardProposals(db: QuestDb): Promise<RewardProposal[]> {
    return await db.all<RewardProposal>(
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
}
