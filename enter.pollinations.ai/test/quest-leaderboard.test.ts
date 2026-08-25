import { env, SELF } from "cloudflare:test";
import { recordRewards } from "@shared/billing/rewards.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("leaderboard returns empty entries when no quest rewards exist", async () => {
    const res = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[] };
    expect(body.entries).toEqual([]);
});

test("leaderboard aggregates quest rewards by user", async () => {
    const db = drizzle(env.DB);

    // Create a second user with GitHub identity
    const user2Id = "user-leaderboard-2";
    await db.insert(userTable).values({
        id: user2Id,
        name: "Leaderboard User 2",
        email: "leaderboard2@test.example.com",
        emailVerified: true,
        githubId: 999002,
        githubUsername: "leaderboard-tester-2",
    });

    // Record quest rewards for user2
    await recordRewards(db, [
        {
            idempotencyKey: "quest:leaderboard-alpha:github:999002",
            userId: user2Id,
            amount: 10,
            bucket: "tier",
            questId: "quest_alpha",
            title: "Quest Alpha",
        },
    ]);

    const res = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
        entries: Array<{
            githubUsername: string;
            githubId: number;
            questCount: number;
            totalPollen: number;
        }>;
    };

    // user2 should be in the leaderboard
    const entry = body.entries.find(
        (e) => e.githubUsername === "leaderboard-tester-2",
    );
    expect(entry).toBeDefined();
    expect(entry!.githubId).toBe(999002);
    expect(entry!.questCount).toBe(1);
    expect(entry!.totalPollen).toBe(10);
});

test("leaderboard excludes users without GitHub identity", async () => {
    const db = drizzle(env.DB);

    // Create a user without GitHub identity
    const noGithubUserId = "user-no-github-lb";
    await db.insert(userTable).values({
        id: noGithubUserId,
        name: "No GitHub User LB",
        email: "nogithublb@test.example.com",
        emailVerified: true,
    });

    await recordRewards(db, [
        {
            idempotencyKey: "quest:no-gh-lb-test:github:null-lb",
            userId: noGithubUserId,
            amount: 5,
            bucket: "tier",
            questId: "quest_gamma",
            title: "Quest Gamma",
        },
    ]);

    const res = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: any[] };

    // The no-github user should be excluded
    const noGithubEntry = body.entries.find((e) => e.githubUsername === null);
    expect(noGithubEntry).toBeUndefined();
});

test("leaderboard only includes quest rewards, not one-off rewards", async () => {
    const db = drizzle(env.DB);

    // Record a one-off reward (questId is null)
    await recordRewards(db, [
        {
            idempotencyKey: "one-off-lb-test:github:999002",
            userId: "user-leaderboard-2",
            amount: 100,
            bucket: "tier",
            questId: null,
            title: "One-off reward",
        },
    ]);

    const res = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: any[] };

    // All entries should have questCount > 0
    for (const entry of body.entries) {
        expect(entry.questCount).toBeGreaterThan(0);
    }
});
