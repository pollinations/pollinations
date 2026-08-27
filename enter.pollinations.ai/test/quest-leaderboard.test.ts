import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect } from "vitest";
import { COMMUNITY_PAGE } from "../../pollinations.ai/src/copy/content/community";
import {
    QuestLeaderboardContent,
    type QuestLeaderboardData,
} from "../../pollinations.ai/src/ui/components/QuestLeaderboard";
import { test } from "./fixtures.ts";

const CACHE_KEY = "quests:leaderboard:v1";

test("quest leaderboard aggregates only public GitHub issue rewards", async () => {
    const db = drizzle(env.DB, { schema });
    await env.KV.delete(CACHE_KEY);

    await db.insert(schema.user).values([
        {
            id: "quest-board-alice",
            name: "Alice",
            email: "quest-board-alice@example.com",
            githubId: 81_001,
            githubUsername: "Alice",
        },
        {
            id: "quest-board-alice-alias",
            name: "Alice alias",
            email: "quest-board-alice-alias@example.com",
            githubId: 81_002,
            githubUsername: "alice",
        },
        {
            id: "quest-board-bob",
            name: "Bob",
            email: "quest-board-bob@example.com",
            githubId: 81_003,
            githubUsername: "bob",
        },
        {
            id: "quest-board-private",
            name: "Private",
            email: "quest-board-private@example.com",
            githubId: 81_004,
            githubUsername: null,
        },
    ]);

    await db.insert(schema.rewards).values([
        {
            id: "quest-board-alice-a",
            idempotencyKey: "quest:github:issue:81001",
            userId: "quest-board-alice",
            questId: "github:issue:81001",
            title: "Alice quest A",
            pollenAmount: 0.1,
            balanceBucket: "tier",
        },
        {
            id: "quest-board-alice-b",
            idempotencyKey: "quest:github:issue:81002",
            userId: "quest-board-alice-alias",
            questId: "github:issue:81002",
            title: "Alice quest B",
            pollenAmount: 0.2,
            balanceBucket: "tier",
        },
        {
            id: "quest-board-bob",
            idempotencyKey: "quest:github:issue:81003",
            userId: "quest-board-bob",
            questId: "github:issue:81003",
            title: "Bob quest",
            pollenAmount: 1,
            balanceBucket: "tier",
        },
        {
            id: "quest-board-product",
            idempotencyKey: "quest:first_top_up:quest-board-bob",
            userId: "quest-board-bob",
            questId: "first_top_up",
            title: "Product quest",
            pollenAmount: 100,
            balanceBucket: "tier",
        },
        {
            id: "quest-board-private-reward",
            idempotencyKey: "quest:github:issue:81004",
            userId: "quest-board-private",
            questId: "github:issue:81004",
            title: "Private quest",
            pollenAmount: 99,
            balanceBucket: "tier",
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
        leaderboard: [
            { githubUsername: "bob", completedQuests: 1, totalPollen: 1 },
            {
                githubUsername: "alice",
                completedQuests: 2,
                totalPollen: 0.3,
            },
        ],
        totals: {
            contributors: 2,
            completedQuests: 3,
            totalPollen: 1.3,
        },
    });
});

test("quest leaderboard renders GitHub identity, totals, and quest CTA", () => {
    const data: QuestLeaderboardData = {
        leaderboard: [
            { githubUsername: "alice", completedQuests: 2, totalPollen: 7 },
            { githubUsername: "bob", completedQuests: 1, totalPollen: 5 },
        ],
        totals: {
            contributors: 2,
            completedQuests: 3,
            totalPollen: 12,
        },
    };

    const html = renderToStaticMarkup(
        createElement(QuestLeaderboardContent, {
            data,
            copy: COMMUNITY_PAGE,
        }),
    );

    expect(html).toContain("Quest leaderboard");
    expect(html).toContain("@alice");
    expect(html).toContain("2 quests");
    expect(html).toContain("7 Pollen");
    expect(html).toContain("2</strong> builders");
    expect(html).toContain("3</strong> completed");
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).toContain('href="https://enter.pollinations.ai/quests"');
});
