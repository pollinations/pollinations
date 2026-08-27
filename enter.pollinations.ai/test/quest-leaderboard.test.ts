import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { createElement } from "../../pollinations.ai/node_modules/react";
import { renderToStaticMarkup } from "../../pollinations.ai/node_modules/react-dom/server";
import {
    QuestLeaderboardContent,
    type QuestLeaderboardData,
} from "../../pollinations.ai/src/ui/components/QuestLeaderboard";
import { test } from "./fixtures.ts";

const CACHE_KEY = "quests:leaderboard:v1";

test("leaderboard filters, merges, rounds, orders, and caches public quest rewards", async () => {
    const db = drizzle(env.DB, { schema });
    await env.KV.delete(CACHE_KEY);

    await db.insert(schema.user).values([
        {
            id: "leaderboard-alice",
            name: "Alice",
            email: "leaderboard-alice@example.com",
            githubId: 1001,
            githubUsername: "Alice",
        },
        {
            id: "leaderboard-alice-alias",
            name: "Alice alias",
            email: "leaderboard-alice-alias@example.com",
            githubId: 1002,
            githubUsername: "alice",
        },
        {
            id: "leaderboard-bob",
            name: "Bob",
            email: "leaderboard-bob@example.com",
            githubId: 1003,
            githubUsername: "bob",
        },
        {
            id: "leaderboard-dave",
            name: "Dave",
            email: "leaderboard-dave@example.com",
            githubId: 1004,
            githubUsername: "dave",
        },
        {
            id: "leaderboard-private",
            name: "Private",
            email: "leaderboard-private@example.com",
            githubId: 1005,
            githubUsername: null,
        },
    ]);

    await db.insert(schema.rewards).values([
        {
            id: "leaderboard-reward-alice-pending",
            idempotencyKey: "quest:github:issue:101",
            userId: "leaderboard-alice",
            questId: "github:issue:101",
            title: "Pending quest",
            pollenAmount: 0.1,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-alice-claimed",
            idempotencyKey: "quest:github:issue:102",
            userId: "leaderboard-alice",
            questId: "github:issue:102",
            title: "Claimed quest",
            pollenAmount: 0.2,
            balanceBucket: "tier",
            claimedAt: new Date(),
        },
        {
            id: "leaderboard-reward-alice-alias",
            idempotencyKey: "quest:github:issue:103",
            userId: "leaderboard-alice-alias",
            questId: "github:issue:103",
            title: "Alias quest",
            pollenAmount: 0.3,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-alice-duplicate",
            idempotencyKey: "quest:github:issue:101:duplicate",
            userId: "leaderboard-alice",
            questId: "github:issue:101",
            title: "Duplicate quest row",
            pollenAmount: 0,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-bob",
            idempotencyKey: "quest:github:issue:104",
            userId: "leaderboard-bob",
            questId: "github:issue:104",
            title: "Bob quest",
            pollenAmount: 0.6,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-dave",
            idempotencyKey: "quest:github:issue:105",
            userId: "leaderboard-dave",
            questId: "github:issue:105",
            title: "Dave quest",
            pollenAmount: 0.6,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-product",
            idempotencyKey: "quest:first_top_up:leaderboard-alice",
            userId: "leaderboard-alice",
            questId: "first_top_up",
            title: "Product reward",
            pollenAmount: 1000,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-private",
            idempotencyKey: "quest:github:issue:106",
            userId: "leaderboard-private",
            questId: "github:issue:106",
            title: "Private quest",
            pollenAmount: 999,
            balanceBucket: "tier",
        },
    ]);

    const first = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
        leaderboard: [
            { githubUsername: "alice", completedQuests: 3, totalPollen: 0.6 },
            { githubUsername: "bob", completedQuests: 1, totalPollen: 0.6 },
            { githubUsername: "dave", completedQuests: 1, totalPollen: 0.6 },
        ],
    });

    await db.insert(schema.rewards).values({
        id: "leaderboard-reward-bob-cache",
        idempotencyKey: "quest:github:issue:107",
        userId: "leaderboard-bob",
        questId: "github:issue:107",
        title: "Fresh Bob quest",
        pollenAmount: 1.5,
        balanceBucket: "tier",
    });

    const cached = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    await expect(cached.json()).resolves.toEqual({
        leaderboard: [
            { githubUsername: "alice", completedQuests: 3, totalPollen: 0.6 },
            { githubUsername: "bob", completedQuests: 1, totalPollen: 0.6 },
            { githubUsername: "dave", completedQuests: 1, totalPollen: 0.6 },
        ],
    });

    await env.KV.delete(CACHE_KEY);
    const refreshed = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    await expect(refreshed.json()).resolves.toEqual({
        leaderboard: [
            { githubUsername: "bob", completedQuests: 2, totalPollen: 2.1 },
            { githubUsername: "alice", completedQuests: 3, totalPollen: 0.6 },
            { githubUsername: "dave", completedQuests: 1, totalPollen: 0.6 },
        ],
    });
});

test("leaderboard content renders public fields and quest link", () => {
    const data: QuestLeaderboardData = {
        leaderboard: [
            { githubUsername: "alice", completedQuests: 2, totalPollen: 1.25 },
        ],
    };
    const markup = renderToStaticMarkup(
        createElement(QuestLeaderboardContent, { data }),
    );

    expect(markup).toContain("Quest leaderboard");
    expect(markup).toContain("@alice");
    expect(markup).toContain("2 quests");
    expect(markup).toContain("1.25 Pollen");
    expect(markup).toContain('href="https://github.com/alice"');
    expect(markup).toContain('href="https://enter.pollinations.ai/quests"');
    expect(markup).not.toContain("leaderboard-alice");
});
