import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

type LeaderboardResponse = {
    leaderboard: {
        githubLogin: string;
        completedQuests: number;
        totalPollen: number;
    }[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

// Seed a dashboard user carrying a public GitHub identity.
async function seedGithubUser(
    db: ReturnType<typeof drizzle>,
    id: string,
    githubUsername: string,
): Promise<void> {
    await db.insert(schema.user).values({
        id,
        name: id,
        email: `${id}@test.local`,
        githubUsername,
    });
}

function issueReward(
    issueNumber: number,
    userId: string,
    pollenAmount: number,
) {
    return {
        id: `reward-github-issue-${issueNumber}-${userId}`,
        idempotencyKey: `quest:github:issue:${issueNumber}:${userId}`,
        userId,
        questId: `github:issue:${issueNumber}`,
        title: "POLLEN-QUEST",
        url: `https://github.com/pollinations/pollinations/issues/${issueNumber}`,
        pollenAmount,
        balanceBucket: "tier",
    };
}

test("quest leaderboard ranks GitHub contributors by earned Pollen", async () => {
    const db = drizzle(env.DB, { schema });

    await seedGithubUser(db, "lb-alice", "alice");
    await seedGithubUser(db, "lb-bob", "bob");

    // alice completes two quests (5 + 3 pollen), bob one (7 pollen).
    await db
        .insert(schema.rewards)
        .values([
            issueReward(900, "lb-alice", 5),
            issueReward(901, "lb-alice", 3),
            issueReward(902, "lb-bob", 7),
        ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as LeaderboardResponse;

    expect(payload.leaderboard).toEqual([
        { githubLogin: "alice", completedQuests: 2, totalPollen: 8 },
        { githubLogin: "bob", completedQuests: 1, totalPollen: 7 },
    ]);
    expect(payload.totals).toEqual({
        contributors: 2,
        completedQuests: 3,
        totalPollen: 15,
    });
});

test("quest leaderboard ignores non-GitHub quests and users without a public GitHub identity", async () => {
    const db = drizzle(env.DB, { schema });

    await seedGithubUser(db, "lb-carol", "carol");
    // A dashboard user without a linked GitHub account can earn rewards,
    // but only public GitHub identities may appear on the board.
    await db.insert(schema.user).values({
        id: "lb-dave",
        name: "dave",
        email: "lb-dave@test.local",
        githubUsername: null,
    });

    await db.insert(schema.rewards).values([
        issueReward(910, "lb-carol", 2),
        // Product quest reward - not a public GitHub POLLEN-QUEST.
        {
            id: "reward-product-top-up-lb-dave",
            idempotencyKey: "first_top_up:lb-dave",
            userId: "lb-dave",
            questId: "first_top_up",
            title: "First top-up",
            pollenAmount: 50,
            balanceBucket: "tier",
        },
        issueReward(911, "lb-dave", 9),
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as LeaderboardResponse;

    expect(payload.leaderboard).toEqual([
        { githubLogin: "carol", completedQuests: 1, totalPollen: 2 },
    ]);
    expect(payload.totals).toEqual({
        contributors: 1,
        completedQuests: 1,
        totalPollen: 2,
    });
});
