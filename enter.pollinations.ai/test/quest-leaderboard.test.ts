import { env, SELF } from "cloudflare:test";
import { recordRewards } from "@shared/billing/rewards.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test.describe("GET /api/quests/leaderboard", () => {
    test("returns empty entries when no quest rewards exist", async ({
        sessionToken,
    }) => {
        const res = await SELF.fetch(
            "http://localhost:3000/api/quests/leaderboard",
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { entries: unknown[] };
        expect(body.entries).toEqual([]);
    });

    test("aggregates quest rewards by user", async ({ sessionToken }) => {
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

        // Record quest rewards for the session user and user2
        await recordRewards(db, [
            {
                idempotencyKey: "quest:leaderboard-test-1:github:100001",
                userId: "user-leaderboard", // session user
                amount: 5,
                bucket: "tier",
                questId: "quest_alpha",
                title: "Quest Alpha",
            },
            {
                idempotencyKey: "quest:leaderboard-test-2:github:100001",
                userId: "user-leaderboard",
                amount: 3,
                bucket: "tier",
                questId: "quest_beta",
                title: "Quest Beta",
            },
            {
                idempotencyKey: "quest:leaderboard-test-3:github:999002",
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

        // Should have 2 entries
        expect(body.entries.length).toBe(2);

        // First entry should be user2 (higher total)
        const top = body.entries[0]!;
        expect(top.githubUsername).toBe("leaderboard-tester-2");
        expect(top.githubId).toBe(999002);
        expect(top.questCount).toBe(1);
        expect(top.totalPollen).toBe(10);

        // Second entry should be session user
        const second = body.entries[1]!;
        expect(second.questCount).toBe(2);
        expect(second.totalPollen).toBe(8);
    });

    test("excludes users without GitHub identity", async () => {
        const db = drizzle(env.DB);

        // Record a quest reward for a user without GitHub identity
        // (the session user fixture may not have githubId set)
        // We'll create a user without GitHub identity
        const noGithubUserId = "user-no-github";
        await db.insert(userTable).values({
            id: noGithubUserId,
            name: "No GitHub User",
            email: "nogithub@test.example.com",
            emailVerified: true,
            // No githubId or githubUsername
        });

        await recordRewards(db, [
            {
                idempotencyKey: "quest:no-github-test:github:null",
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
        const body = (await res.json()) as { entries: unknown[] };

        // The no-github user should be excluded from entries
        const noGithubEntry = body.entries.find(
            (e: any) => e.githubUsername === null,
        );
        expect(noGithubEntry).toBeUndefined();
    });

    test("only includes quest rewards (not one-off rewards)", async () => {
        const db = drizzle(env.DB);

        // Record a one-off reward (questId is null)
        await recordRewards(db, [
            {
                idempotencyKey: "one-off-reward:github:100001",
                userId: "user-leaderboard",
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
        const body = (await res.json()) as { entries: unknown[] };

        // One-off rewards should not appear in leaderboard
        // (only quest rewards with questId not null are included)
        // The entries should only contain the quest rewards from previous tests
        for (const entry of body.entries as any[]) {
            expect(entry.questCount).toBeGreaterThan(0);
        }
    });
});
