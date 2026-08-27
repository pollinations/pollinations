import { env, SELF } from "cloudflare:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, vi } from "vitest";
import { COMMUNITY_PAGE } from "../../pollinations.ai/src/copy/content/community";
import type { QuestLeaderboardData } from "../../pollinations.ai/src/ui/components/QuestLeaderboard";
import { test } from "./fixtures.ts";

const nestedReactRuntimeUrls = [
    new URL(
        "../../pollinations.ai/node_modules/react/jsx-runtime.js",
        import.meta.url,
    ),
    new URL(
        "../../pollinations.ai/node_modules/react/jsx-dev-runtime.js",
        import.meta.url,
    ),
];
const nestedReactRuntimeModules = import.meta.glob(
    "../../pollinations.ai/node_modules/react/jsx*-runtime.js",
);
const hasNestedReactRuntimes =
    nestedReactRuntimeUrls.some((url) => existsSync(fileURLToPath(url))) ||
    Object.keys(nestedReactRuntimeModules).length > 0;

if (hasNestedReactRuntimes) {
    vi.doMock(
        "../../pollinations.ai/node_modules/react/jsx-runtime",
        async () => vi.importActual("react/jsx-runtime"),
    );
    vi.doMock(
        "../../pollinations.ai/node_modules/react/jsx-dev-runtime",
        async () => vi.importActual("react/jsx-dev-runtime"),
    );
}

vi.doMock("../../pollinations.ai/src/ui/components/ui/typography", () => ({
    Body: ({ children }: { children: string }) =>
        createElement("p", null, children),
    Heading: ({ children, ...props }: { children: string; id: string }) =>
        createElement("h2", props, children),
}));

const { parseQuestLeaderboardEntries, QuestLeaderboardContent } = await import(
    "../../pollinations.ai/src/ui/components/QuestLeaderboard"
);

const CACHE_KEY = "quests:leaderboard:v1";
const initialLeaderboard = [
    {
        githubUsername: "alice",
        completedQuests: 3,
        totalPollen: 0.6,
    },
    { githubUsername: "bob", completedQuests: 1, totalPollen: 0.6 },
    {
        githubUsername: "dave",
        completedQuests: 1,
        totalPollen: 0.6,
    },
];

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
        leaderboard: initialLeaderboard,
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
        leaderboard: initialLeaderboard,
    });

    await env.KV.delete(CACHE_KEY);
    const refreshed = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    await expect(refreshed.json()).resolves.toEqual({
        leaderboard: [
            { githubUsername: "bob", completedQuests: 2, totalPollen: 2.1 },
            {
                githubUsername: "alice",
                completedQuests: 3,
                totalPollen: 0.6,
            },
            {
                githubUsername: "dave",
                completedQuests: 1,
                totalPollen: 0.6,
            },
        ],
    });
});

test("leaderboard content renders public fields and quest link", () => {
    const data: QuestLeaderboardData = {
        leaderboard: [
            { githubUsername: "alice", completedQuests: 1, totalPollen: 1.25 },
            {
                githubUsername: "octo/user",
                completedQuests: 2,
                totalPollen: 2.5,
            },
        ],
    };
    const markup = renderToStaticMarkup(
        createElement(QuestLeaderboardContent, {
            data,
            copy: COMMUNITY_PAGE,
        }),
    );

    expect(markup).toContain("Quest leaderboard");
    expect(markup).toContain("@alice");
    expect(markup).toContain("1 quest");
    expect(markup).not.toContain("1 quests");
    expect(markup).toContain("2 quests");
    expect(markup).toContain("1.25 Pollen");
    expect(markup).toContain('href="https://github.com/octo%2Fuser"');
    expect(markup).toContain('href="https://enter.pollinations.ai/quests"');
    expect(markup).not.toContain("leaderboard-alice");
});

test("leaderboard payload validation drops malformed rows", () => {
    expect(
        parseQuestLeaderboardEntries([
            {
                githubUsername: " Alice ",
                completedQuests: 1,
                totalPollen: 0.5,
            },
            null,
            { githubUsername: "", completedQuests: 2, totalPollen: 1 },
            { githubUsername: "bob", completedQuests: 1.5, totalPollen: 1 },
            { githubUsername: "carol", completedQuests: 1, totalPollen: -1 },
            {
                githubUsername: "dave",
                completedQuests: 1,
                totalPollen: Infinity,
            },
        ]),
    ).toEqual([
        { githubUsername: "Alice", completedQuests: 1, totalPollen: 0.5 },
    ]);
});
