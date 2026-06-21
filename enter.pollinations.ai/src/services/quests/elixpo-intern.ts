import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import { PRODUCT_QUEST_REWARD_SOURCE } from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import type { QuestDb, QuestInstance, QuestModule } from "./types.ts";

// elixpo (Ayushman Bhattacharya) joined the team as an intern — a one-off
// welcome quest scoped to his GitHub account. Shown only to him; grants once.
const TARGET_GITHUB_ID = 161_109_909;
const MAX_GRANTS_PER_RUN = 1;

type ElixpoInternRow = {
    userId: string;
    githubId: number;
};

export const elixpoInternQuest = {
    definition: {
        id: "easteregg:elixpo_intern",
        title: "Developer Relations Intern, unlocked 🌻",
        description:
            "It's official, elixpo — welcome to the Pollinations crew.",
        iconId: "sprout",
        rewardAmount: 100,
        balanceBucket: "pack",
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
    // Only surface this quest for elixpo's account, and only once it has been
    // granted — so it appears already-completed and never as an open quest.
    async instances({ db }) {
        return buildInstances(db);
    },
} satisfies QuestModule;

const USER_KEY_PREFIX = `quest:${elixpoInternQuest.definition.id}:user:`;

async function buildInstances(db: QuestDb): Promise<QuestInstance[]> {
    const rows = await db.all<ElixpoInternRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId
        FROM user
        INNER JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${USER_KEY_PREFIX} || user.id
        WHERE user.github_id = ${TARGET_GITHUB_ID}
        LIMIT 1`,
    );

    const row = rows[0];
    if (!row) return [];

    return [
        {
            id: elixpoInternQuest.definition.id,
            kind: "product",
            title: elixpoInternQuest.definition.title,
            description: elixpoInternQuest.definition.description,
            iconId: elixpoInternQuest.definition.iconId,
            availability: "completed",
            rewardAmount: elixpoInternQuest.definition.rewardAmount,
            url: null,
        },
    ];
}

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<ElixpoInternRow>(
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
            message: "Welcome aboard as a Pollinations intern, elixpo.",
            githubId: row.githubId,
            githubUsername: "elixpo",
        },
    }));
}
