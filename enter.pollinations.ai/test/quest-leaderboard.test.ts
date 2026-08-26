import { env, SELF } from "cloudflare:test";
import { recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

// The public leaderboard aggregates the reward ledger by public GitHub login.
// It must expose only aggregate rows (login, completed count, pollen total)
// and rank by completed quests with pollen as the deterministic tiebreak.
test("quest leaderboard returns public aggregates ranked by completions", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const now = new Date();

    await db.insert(schema.user).values([
        {
            id: "leaderboard-alice",
            name: "Alice",
            email: "alice@example.com",
            githubId: 910001,
            githubUsername: "alice",
            createdAt: now,
            updatedAt: now,
        },
        {
            id: "leaderboard-bob",
            name: "Bob",
            email: "bob@example.com",
            githubId: 910002,
            githubUsername: "bob",
            createdAt: now,
            updatedAt: now,
        },
        // No GitHub login — must never appear on a public board.
        {
            id: "leaderboard-anon",
            name: "Anon",
            email: "anon@example.com",
            githubId: null,
            githubUsername: null,
            createdAt: now,
            updatedAt: now,
        },
    ]);

    await recordRewards(db, [
        // Alice: two completed quests, 8 pollen total.
        {
            idempotencyKey: "quest:github:issue:9001",
            userId: "leaderboard-alice",
            questId: "github:issue:9001",
            title: "Ship bounty #9001",
            amount: 5,
            bucket: "tier",
        },
        {
            idempotencyKey: "quest:github:issue:9002",
            userId: "leaderboard-alice",
            questId: "github:issue:9002",
            title: "Ship bounty #9002",
            amount: 3.5,
            bucket: "tier",
        },
        // Bob: one quest worth more pollen than either of Alice's alone.
        {
            idempotencyKey: "quest:github:issue:9003",
            userId: "leaderboard-bob",
            questId: "github:issue:9003",
            title: "Ship bounty #9003",
            amount: 12,
            bucket: "tier",
        },
        // Anon reward exists but has no public identity to show.
        {
            idempotencyKey: "quest:github:issue:9004",
            userId: "leaderboard-anon",
            questId: "github:issue:9004",
            title: "Ship bounty #9004",
            amount: 100,
            bucket: "tier",
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);
    const { leaderboard } = (await response.json()) as {
        leaderboard: Array<{
            githubUsername: string;
            completedQuests: number;
            totalPollen: number;
        }>;
    };

    const alice = leaderboard.find((e) => e.githubUsername === "alice");
    const bob = leaderboard.find((e) => e.githubUsername === "bob");
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();

    // Ranked by completions first; pollen is only the tiebreak.
    expect(leaderboard.indexOf(alice!)).toBeLessThan(leaderboard.indexOf(bob!));
    expect(alice).toEqual({
        githubUsername: "alice",
        completedQuests: 2,
        totalPollen: 8.5,
    });
    expect(bob).toEqual({
        githubUsername: "bob",
        completedQuests: 1,
        totalPollen: 12,
    });

    // Aggregate only: no user ids or per-reward details leak.
    const serialized = JSON.stringify(leaderboard);
    expect(serialized).not.toContain("leaderboard-alice");
    expect(serialized).not.toContain("idempotencyKey");
    expect(serialized).not.toContain("userId");
});
