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

    // Create a user with GitHub identity
    const userId = "user-lb-agg";
    await db.insert(userTable).values({
        id: userId,
        name: "Leaderboard User",
        email: "lb-agg@test.example.com",
        emailVerified: true,
        githubId: 888001,
        githubUsername: "lb-test-user",
    });

    // Record quest rewards
    await recordRewards(db, [
        {
            idempotencyKey: "quest:lb-agg-1:github:888001",
            userId,
            amount: 7,
            bucket: "tier",
            questId: "quest_alpha",
            title: "Quest Alpha",
        },
        {
            idempotencyKey: "quest:lb-agg-2:github:888001",
            userId,
            amount: 3,
            bucket: "tier",
            questId: "quest_beta",
            title: "Quest Beta",
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

    const entry = body.entries.find((e) => e.githubUsername === "lb-test-user");
    expect(entry).toBeDefined();
    expect(entry!.githubId).toBe(888001);
    expect(entry!.questCount).toBe(2);
    expect(entry!.totalPollen).toBe(10);
});

test("leaderboard excludes users without GitHub identity", async () => {
    const db = drizzle(env.DB);

    // User without GitHub identity
    const userId = "user-no-gh-lb";
    await db.insert(userTable).values({
        id: userId,
        name: "No GitHub User LB",
        email: "no-gh-lb@test.example.com",
        emailVerified: true,
    });

    await recordRewards(db, [
        {
            idempotencyKey: "quest:no-gh-lb:github:null",
            userId,
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

    // The no-github user should not appear in leaderboard
    const noGithubEntry = body.entries.find(
        (e) => e.githubUsername === null || e.githubId === null,
    );
    expect(noGithubEntry).toBeUndefined();
});

test("leaderboard only includes quest rewards, not one-off rewards", async () => {
    const db = drizzle(env.DB);

    // User with GitHub identity
    const userId = "user-qo-lb";
    await db.insert(userTable).values({
        id: userId,
        name: "Quest Only User LB",
        email: "qo-lb@test.example.com",
        emailVerified: true,
        githubId: 888003,
        githubUsername: "qo-lb-user",
    });

    // Record a one-off reward (questId is null) and a quest reward
    await recordRewards(db, [
        {
            idempotencyKey: "one-off-lb:github:888003",
            userId,
            amount: 100,
            bucket: "tier",
            questId: null,
            title: "One-off reward",
        },
        {
            idempotencyKey: "quest:qo-lb:github:888003",
            userId,
            amount: 5,
            bucket: "tier",
            questId: "quest_delta",
            title: "Quest Delta",
        },
    ]);

    const res = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: any[] };

    // The entry for this user should only count the quest reward (5, not 105)
    const entry = body.entries.find((e) => e.githubUsername === "qo-lb-user");
    expect(entry).toBeDefined();
    expect(entry!.questCount).toBe(1);
    expect(entry!.totalPollen).toBe(5);
});
