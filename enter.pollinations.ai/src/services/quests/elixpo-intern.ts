import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestModule } from "./types.ts";

const TARGET_GITHUB_ID = 161_109_909;
const MAX_GRANTS_PER_RUN = 1;

type ElixpoInternQuestRow = {
    userId: string;
    githubId: number;
};

export const elixpoInternQuest = {
    definition: {
        id: "easteregg:elixpo_intern",
        title: "Welcome intern, elixpo",
        description: "A small welcome bonus for elixpo joining as an intern.",
        rewardAmount: 10,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
    async instances() {
        return [];
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${elixpoInternQuest.definition.id}:user:`;

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<ElixpoInternQuestRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId
        FROM user
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${USER_KEY_PREFIX} || user.id
        WHERE user.github_id = ${TARGET_GITHUB_ID}
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        idempotencyKey: `${USER_KEY_PREFIX}${row.userId}`,
        userId: row.userId,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        questId: elixpoInternQuest.definition.id,
        amount: elixpoInternQuest.definition.rewardAmount,
        bucket: elixpoInternQuest.definition.balanceBucket,
        sourceRef: `github:${row.githubId}`,
        metadata: {
            title: elixpoInternQuest.definition.title,
            message: "Congrats on becoming a Pollinations intern, elixpo.",
            githubId: row.githubId,
            githubUsername: "elixpo",
        },
    }));
}
