import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { rewards as rewardsTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("GET /api/quests/leaderboard aggregates public GitHub quest rewards", async () => {
    const db = drizzle(env.DB, { schema });
    const now = new Date();

    await db.insert(schema.user).values([
        {
            id: "lb-alice",
            name: "lb-alice",
            email: "lb-alice@example.com",
            githubId: 901,
            githubUsername: "alice",
            image: "https://avatars.example.com/alice.png",
            createdAt: now,
            updatedAt: now,
        },
        {
            id: "lb-bob",
            name: "lb-bob",
            email: "lb-bob@example.com",
            githubId: 902,
            githubUsername: "bob",
            createdAt: now,
            updatedAt: now,
        },
        {
            id: "lb-carol",
            name: "lb-carol",
            email: "lb-carol@example.com",
            createdAt: now,
            updatedAt: now,
        },
    ]);

    await db.insert(rewardsTable).values([
        {
            id: "lb-r1",
            idempotencyKey: "lb-r1",
            userId: "lb-alice",
            questId: "github:issue:100",
            title: "Quest A",
            pollenAmount: 10,
            balanceBucket: "tier",
            earnedAt: now,
        },
        {
            id: "lb-r2",
            idempotencyKey: "lb-r2",
            userId: "lb-alice",
            questId: "github:issue:101",
            title: "Quest B",
            pollenAmount: 5.25,
            balanceBucket: "tier",
            earnedAt: now,
        },
        {
            id: "lb-r3",
            idempotencyKey: "lb-r3",
            userId: "lb-bob",
            questId: "github:issue:102",
            title: "Quest C",
            pollenAmount: 10,
            balanceBucket: "tier",
            earnedAt: now,
        },
        // One-off grant without a quest id — never counted.
        {
            id: "lb-r4",
            idempotencyKey: "lb-r4",
            userId: "lb-alice",
            questId: null,
            title: "Thank-you",
            pollenAmount: 50,
            balanceBucket: "tier",
            earnedAt: now,
        },
        // Quest id outside the public GitHub issue namespace — not counted.
        {
            id: "lb-r5",
            idempotencyKey: "lb-r5",
            userId: "lb-bob",
            questId: "merged_pr",
            title: "Contribute a pull request",
            pollenAmount: 99,
            balanceBucket: "tier",
            earnedAt: now,
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        leaderboard: Array<{
            githubUsername: string;
            avatarUrl: string | null;
            completedQuests: number;
            totalPollen: number;
        }>;
    };

    expect(body.leaderboard[0]).toEqual({
        githubUsername: "alice",
        avatarUrl: "https://avatars.example.com/alice.png",
        completedQuests: 2,
        totalPollen: 15.25,
    });
    expect(body.leaderboard[1]).toEqual({
        githubUsername: "bob",
        avatarUrl: null,
        completedQuests: 1,
        totalPollen: 10,
    });
    // Carol has an account but no public quest rewards — not listed.
    expect(
        body.leaderboard.find((e) => e.githubUsername === "carol"),
    ).toBeUndefined();
});

test("GET /api/quests/leaderboard returns an empty list with no quest rewards", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { leaderboard: unknown[] };
    expect(body.leaderboard).toEqual([]);
});
