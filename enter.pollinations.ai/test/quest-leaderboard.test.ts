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

    // Product quests count too, not just GitHub issue bounties.
    await db.insert(schema.rewards).values({
        id: "leaderboard-non-github-reward",
        idempotencyKey: "quest:first_top_up:leaderboard-user-51",
        userId: "leaderboard-user-51",
        questId: "first_top_up",
        title: "First top up",
        pollenAmount: 1_000,
        balanceBucket: "tier",
    });

    // Private identities contribute to totals but never appear in the ranking.
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
        completedQuests: 5,
        totalPollen: 1051.8,
    });
    expect(payload.leaderboard.at(-1)).toEqual({
        githubLogin: "builder-2",
        completedQuests: 1,
        totalPollen: 2,
    });

    // Count every earned ledger entry, including the bonus, product quest and
    // private reward. Participants are distinct account IDs, not GitHub logins.
    expect(payload.totals).toEqual({
        contributors: 53,
        completedQuests: 56,
        totalPollen: 3325.8,
    });
    expect(JSON.stringify(payload)).not.toContain("Private Builder");
    expect(JSON.stringify(payload)).not.toContain("leaderboard-private");
});

test("all reward types count regardless of claim state or balance bucket, but purchases and wallet balances do not", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.user).values({
        id: "all-rewards-user",
        name: "Reward participant",
        email: "all-rewards@example.com",
        githubId: 9_200_001,
        githubUsername: "reward-participant",
        packBalance: 10_000,
        tierBalance: 20_000,
    });
    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: "leaderboard-purchase",
        eventId: "leaderboard-purchase-event",
        eventType: "checkout.session.completed",
        userId: "all-rewards-user",
        pollenCredited: 10_000,
    });
    const questIds = [
        "first_api_key",
        "app_listed",
        "app_users_10",
        "use_text_model",
        "use_agent",
        "join_discord",
        "github:reported_issue:123",
        "grant:contributor-thanks",
        null,
    ];
    for (const [index, questId] of questIds.entries()) {
        await db.insert(schema.rewards).values({
            id: `all-rewards-${index}`,
            idempotencyKey: `all-rewards-${index}`,
            userId: "all-rewards-user",
            questId,
            title: `Reward ${index}`,
            pollenAmount: 1,
            balanceBucket: index % 2 ? "pack" : "tier",
            claimedAt: index % 2 ? new Date() : null,
        });
    }
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as ApiResponse;
    expect(payload.totals).toEqual({
        contributors: 1,
        completedQuests: 9,
        totalPollen: 9,
    });
    expect(payload.leaderboard).toEqual([
        {
            githubLogin: "reward-participant",
            completedQuests: 9,
            totalPollen: 9,
        },
    ]);
    // Reading the leaderboard must not claim rewards or change balances.
    const [user] = await db.select().from(schema.user);
    expect(user.packBalance).toBe(10_000);
    expect(user.tierBalance).toBe(20_000);
    const rewards = await db.select().from(schema.rewards);
    expect(rewards.filter((reward) => reward.claimedAt === null)).toHaveLength(
        5,
    );
});

test("empty leaderboard returns zero totals and uses the new cache key", async () => {
    await env.KV.put("quests:leaderboard:v1", JSON.stringify({ stale: true }));
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
        leaderboard: [],
        totals: { contributors: 0, completedQuests: 0, totalPollen: 0 },
    });
    expect(await env.KV.get("quests:leaderboard:v2", "json")).toEqual(payload);
});

test("rendered leaderboard shows GitHub identity, reward counts, Pollen, and CTA", () => {
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
    expect(html).toContain("2 rewards");
    expect(html).toContain("1 reward");
    expect(html).toContain("Participants");
    expect(html).toContain("Rewards earned");
    expect(html).toContain(
        "Pollen earned by completing Quests and contributing to Pollinations.",
    );
    expect(html).not.toContain("public GitHub Pollen Quests");
    expect(html).toContain("12.5 Pollen");
    expect(html).toContain('href="https://github.com/alice"');
    expect(html).toContain('src="https://github.com/alice.png?size=64"');
    expect(html).toContain('href="https://enter.pollinations.ai/quests"');
    expect(html).toContain("19.5");
});
