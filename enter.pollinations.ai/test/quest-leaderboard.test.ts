import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect } from "vitest";
import {
    QuestLeaderboardContent,
    type QuestLeaderboardData,
} from "../../pollinations.ai/src/ui/components/QuestLeaderboard";
import { test } from "./fixtures.ts";

type ApiResponse = QuestLeaderboardData;

test("leaderboard limits rows without truncating aggregate totals", async () => {
    const db = drizzle(env.DB, { schema });
    const builders = Array.from({ length: 51 }, (_, index) => {
        const rank = index + 1;
        return {
            id: `leaderboard-user-${rank}`,
            name: `Builder ${rank}`,
            email: `leaderboard-${rank}@example.com`,
            githubId: 9_000_000 + rank,
            githubUsername: `builder-${rank}`,
        };
    });

    for (let index = 0; index < builders.length; index += 10) {
        await db.insert(schema.user).values(builders.slice(index, index + 10));
    }
    const rewards: (typeof schema.rewards.$inferInsert)[] = builders.map(
        (builder, index) => {
            const reward = index + 1;
            return {
                id: `leaderboard-reward-${reward}`,
                idempotencyKey: `quest:github:issue:${20_000 + reward}`,
                userId: builder.id,
                questId: `github:issue:${20_000 + reward}`,
                title: `Quest ${20_000 + reward}`,
                url: `https://github.com/pollinations/pollinations/issues/${20_000 + reward}`,
                pollenAmount: reward,
                balanceBucket: "tier",
            };
        },
    );
    for (let index = 0; index < rewards.length; index += 10) {
        await db
            .insert(schema.rewards)
            .values(rewards.slice(index, index + 10));
    }

    // GitHub logins are case-insensitive, including across linked accounts.
    await db.insert(schema.user).values({
        id: "leaderboard-user-51-alias",
        name: "Builder 51 alias",
        email: "leaderboard-51-alias@example.com",
        githubId: 9_100_051,
        githubUsername: "Builder-51",
    });
    await db.insert(schema.rewards).values([
        {
            id: "leaderboard-reward-51-decimal-a",
            idempotencyKey: "quest:github:issue:30001",
            userId: "leaderboard-user-51",
            questId: "github:issue:30001",
            title: "Decimal quest A",
            pollenAmount: 0.1,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-51-decimal-b",
            idempotencyKey: "quest:github:issue:30002",
            userId: "leaderboard-user-51-alias",
            questId: "github:issue:30002",
            title: "Decimal quest B",
            pollenAmount: 0.2,
            balanceBucket: "tier",
        },
        {
            id: "leaderboard-reward-51-bonus",
            idempotencyKey: "manual:github:issue:30002:bonus",
            userId: "leaderboard-user-51-alias",
            questId: "github:issue:30002",
            title: "Quest 30002 bonus",
            pollenAmount: 0.5,
            balanceBucket: "tier",
        },
    ]);

    // A large product reward must not affect the public GitHub quest board.
    await db.insert(schema.rewards).values({
        id: "leaderboard-non-github-reward",
        idempotencyKey: "quest:first_top_up:leaderboard-user-51",
        userId: "leaderboard-user-51",
        questId: "first_top_up",
        title: "First top up",
        pollenAmount: 1_000,
        balanceBucket: "tier",
    });

    // A GitHub-shaped reward without a public GitHub login must stay private.
    await db.insert(schema.user).values({
        id: "leaderboard-private-user",
        name: "Private Builder",
        email: "leaderboard-private@example.com",
        githubId: 9_999_999,
        githubUsername: null,
    });
    await db.insert(schema.rewards).values({
        id: "leaderboard-private-reward",
        idempotencyKey: "quest:github:issue:29999",
        userId: "leaderboard-private-user",
        questId: "github:issue:29999",
        title: "Private quest",
        pollenAmount: 999,
        balanceBucket: "tier",
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as ApiResponse;
    expect(payload.leaderboard).toHaveLength(50);
    expect(payload.leaderboard[0]).toEqual({
        githubLogin: "builder-51",
        completedQuests: 3,
        totalPollen: 51.8,
    });
    expect(payload.leaderboard.at(-1)).toEqual({
        githubLogin: "builder-2",
        completedQuests: 1,
        totalPollen: 2,
    });

    // 1 + ... + 51 + 0.1 + 0.2 + 0.5 = 1326.8. The bonus contributes
    // Pollen without counting the same quest twice.
    expect(payload.totals).toEqual({
        contributors: 51,
        completedQuests: 53,
        totalPollen: 1326.8,
    });
});

test("rendered leaderboard shows GitHub identity, quest counts, Pollen, and CTA", () => {
    const data: QuestLeaderboardData = {
        leaderboard: [
            { githubLogin: "alice", completedQuests: 2, totalPollen: 12.5 },
            { githubLogin: "bob", completedQuests: 1, totalPollen: 7 },
        ],
        totals: {
            contributors: 2,
            completedQuests: 3,
            totalPollen: 19.5,
        },
    };

    const html = renderToStaticMarkup(
        createElement(QuestLeaderboardContent, { data }),
    );

    expect(html).toContain("Quest leaderboard");
    expect(html).toContain("@alice");
    expect(html).toContain("2 completed");
    expect(html).toContain("12.5 Pollen");
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).toContain('src="https://github.com/alice.png?size=64"');
    expect(html).toContain('href="https://enter.pollinations.ai/quests"');
    expect(html).toContain("19.5");
});
