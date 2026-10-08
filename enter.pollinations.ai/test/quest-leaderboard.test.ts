import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect } from "vitest";
import type { QuestLeaderboardData } from "../../pollinations.ai/src/data/community";
import { QuestLeaderboard } from "../../pollinations.ai/src/ui/components/QuestLeaderboard";
import { QuestStandings } from "../frontend/src/components/quests/quest-standings.tsx";
import {
    buildQuestStandings,
    type QuestStandingsResponse,
} from "../src/routes/quest-leaderboard.ts";
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

test("rendered leaderboard shows its heading and CTA while loading", () => {
    const html = renderToStaticMarkup(createElement(QuestLeaderboard));
    expect(html).toContain("Quest leaderboard");
    expect(html).toContain('href="https://enter.pollinations.ai/quests"');
    expect(html).toContain('aria-busy="true"');
});

test("voodoohop is excluded from both quest leaderboards", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.user).values([
        {
            id: "excluded-leaderboard-user",
            name: "Excluded user",
            email: "excluded-leaderboard@example.com",
            githubId: 8_999_998,
            githubUsername: "VoodooHop",
        },
        {
            id: "included-leaderboard-user",
            name: "Included user",
            email: "included-leaderboard@example.com",
            githubId: 8_999_999,
            githubUsername: "included-builder",
        },
    ]);
    await db.insert(schema.rewards).values([
        {
            id: "excluded-leaderboard-reward",
            idempotencyKey: "excluded-leaderboard-reward",
            userId: "excluded-leaderboard-user",
            questId: "github:issue:12345",
            title: "Excluded quest",
            pollenAmount: 10,
            balanceBucket: "tier",
        },
        {
            id: "included-leaderboard-reward",
            idempotencyKey: "included-leaderboard-reward",
            userId: "included-leaderboard-user",
            questId: "github:issue:12346",
            title: "Included quest",
            pollenAmount: 2,
            balanceBucket: "tier",
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/leaderboard",
    );
    const leaderboard = (await response.json()) as ApiResponse;
    expect(leaderboard.leaderboard.map((row) => row.githubLogin)).toEqual([
        "included-builder",
    ]);
    expect(leaderboard.totals).toEqual({
        contributors: 1,
        completedQuests: 1,
        totalPollen: 2,
    });

    const standings = await buildQuestStandings(env, "VoodooHop");
    expect(standings.participants).toBe(1);
    expect(standings.rows.map((row) => row.githubLogin)).toEqual([
        "included-builder",
    ]);
    expect(standings.you).toBeNull();
});

test("monthly standings show the podium and the rows around the viewer", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const viewer = await db.query.user.findFirst();
    if (!viewer?.githubUsername) throw new Error("Viewer has no GitHub login");

    // Pollen this month: rival-1..6 earn 60, 50, ..., 10; the viewer earns 25,
    // which ranks them 5th between rival-4 (30) and rival-5 (20).
    const rivals = Array.from({ length: 6 }, (_, index) => ({
        id: `standings-user-${index + 1}`,
        name: `Rival ${index + 1}`,
        email: `standings-${index + 1}@example.com`,
        githubId: 8_000_000 + index,
        githubUsername: `rival-${index + 1}`,
    }));
    await db.insert(schema.user).values(rivals);
    const reward = (
        id: string,
        userId: string,
        questId: string,
        pollenAmount: number,
        earnedAt = new Date(),
    ) => ({
        id,
        idempotencyKey: id,
        userId,
        questId,
        title: id,
        pollenAmount,
        balanceBucket: "tier",
        earnedAt,
    });
    await db.insert(schema.rewards).values([
        ...rivals.map((rival, index) =>
            reward(
                `standings-${rival.id}`,
                rival.id,
                "merged_pr",
                60 - index * 10,
            ),
        ),
        // A top-up makes rival-4 a supporter and counts like any quest.
        reward(
            "standings-top-up",
            "standings-user-4",
            "top_up_since_launch",
            5,
        ),
        reward("standings-viewer", viewer.id, "merged_pr", 25),
        // Last month's rewards do not count this month.
        reward(
            "standings-old",
            "standings-user-6",
            "merged_pr",
            1_000,
            new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        ),
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/standings",
        { headers: { cookie: `better-auth.session_token=${sessionToken}` } },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as QuestStandingsResponse;

    expect(payload.participants).toBe(7);
    expect(payload.you).toEqual({
        githubLogin: viewer.githubUsername.toLowerCase(),
        rank: 5,
        totalPollen: 25,
    });
    // Podium (1-3) plus two above and one below the viewer (3-6); rival-6
    // in 7th is out of view. Only the top-up earner is marked a supporter.
    const login = viewer.githubUsername.toLowerCase();
    expect(
        payload.rows.map((row) => [
            row.rank,
            row.githubLogin,
            row.totalPollen,
            row.supporter,
        ]),
    ).toEqual([
        [1, "rival-1", 60, false],
        [2, "rival-2", 50, false],
        [3, "rival-3", 40, false],
        [4, "rival-4", 35, true],
        [5, login, 25, false],
        [6, "rival-5", 20, false],
    ]);

    const anonymous = await SELF.fetch(
        "http://localhost:3000/api/quests/standings",
    );
    const publicView = (await anonymous.json()) as QuestStandingsResponse;
    expect(publicView.you).toBeNull();
    expect(publicView.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
});

test("rendered standings point the viewer at the quest that passes the next row", () => {
    const standings: QuestStandingsResponse = {
        month: "2026-10",
        endsAt: "2026-11-01T00:00:00.000Z",
        participants: 12,
        rows: [
            { rank: 1, githubLogin: "alice", totalPollen: 40, supporter: true },
            {
                rank: 11,
                githubLogin: "bob",
                totalPollen: 5.5,
                supporter: false,
            },
            { rank: 12, githubLogin: "me", totalPollen: 4.5, supporter: false },
        ],
        you: { githubLogin: "me", rank: 12, totalPollen: 4.5 },
    };
    const html = renderToStaticMarkup(
        createElement(QuestStandings, {
            standings,
            openQuests: [
                { title: "Join the Discord", reward: 1 },
                { title: "Use a text model", reward: 0.25 },
                { title: "Contribute a pull request", reward: 5 },
            ],
            now: Date.parse("2026-10-21T12:00:00.000Z"),
        }),
    );

    expect(html).toContain("October leaderboard");
    expect(html).toContain("11 days left");
    expect(html).toContain("Pollen supporter");
    // A 1 Pollen gap needs more than 1 Pollen, so the 5 Pollen quest is next.
    expect(html).toContain(
        "1 Pollen to pass @bob — “Contribute a pull request” is +5.",
    );
});

test("rendered standings show the minimum increment for a tied row", () => {
    const standings: QuestStandingsResponse = {
        month: "2026-10",
        endsAt: "2026-11-01T00:00:00.000Z",
        participants: 2,
        rows: [
            {
                rank: 1,
                githubLogin: "alice",
                totalPollen: 4.5,
                supporter: true,
            },
            { rank: 2, githubLogin: "me", totalPollen: 4.5, supporter: false },
        ],
        you: { githubLogin: "me", rank: 2, totalPollen: 4.5 },
    };
    const html = renderToStaticMarkup(
        createElement(QuestStandings, {
            standings,
            openQuests: [{ title: "Use a text model", reward: 0.25 }],
            now: Date.parse("2026-10-21T12:00:00.000Z"),
        }),
    );

    expect(html).toContain(
        "0.25 Pollen to pass @alice — “Use a text model” is +0.25.",
    );
});
