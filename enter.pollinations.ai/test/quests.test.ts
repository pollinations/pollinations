import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { runQuestEvaluator } from "../src/services/quest-evaluator.ts";
import { test } from "./fixtures.ts";

async function getOnlyUser() {
    const db = drizzle(env.DB, { schema });
    const users = await db
        .select({
            id: schema.user.id,
            packBalance: schema.user.packBalance,
        })
        .from(schema.user)
        .limit(1);

    const user = users[0];
    if (!user) throw new Error("Expected fixture user");
    return user;
}

test("GET /api/quests/catalog returns launch catalog and D1 definitions", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.questDefinitions).values({
        id: "engage:seven_day_streak",
        title: "Use Pollinations for 7 days",
        description: "Make at least one request on seven consecutive days.",
        category: "engage",
        status: "planned",
        trigger: "first_chat_completion",
        rewardAmount: 1,
        balanceBucket: "pack",
        repeatability: "once",
        criteriaJson: JSON.stringify({ days: 7 }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            status: string;
            balanceBucket: string;
            storage: string;
            criteria: { days?: number } | null;
        }[];
    };

    expect(
        payload.quests.filter((quest) => quest.status === "active"),
    ).toHaveLength(2);
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({ balanceBucket: "pack", storage: "checked_in" });
    expect(
        payload.quests.find((quest) => quest.id === "engage:seven_day_streak"),
    ).toMatchObject({
        balanceBucket: "pack",
        storage: "d1",
        criteria: { days: 7 },
    });
});

test("quest evaluator grants D1-backed product quests once", async ({
    apiKey: _apiKey,
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();

    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: `cs_test_${user.id}`,
        eventId: `evt_${user.id}`,
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 10,
        createdAt: new Date(),
    });

    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 1, granted: 1 },
        { questId: "spend:first_top_up", scanned: 1, granted: 1 },
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 2.5);

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        totalPollen: number;
        grants: {
            idempotencyKey: string;
            questId: string | null;
            pollenCredited: number;
            balanceBucket: string;
            legacy: boolean;
        }[];
    };

    expect(payload.totalPollen).toBeCloseTo(2.5);
    expect(payload.grants).toHaveLength(2);
    expect(
        payload.grants.find(
            (grant) => grant.questId === "onboarding:first_api_key",
        ),
    ).toMatchObject({
        pollenCredited: 0.5,
        balanceBucket: "pack",
        legacy: false,
    });
    expect(
        payload.grants.find((grant) => grant.questId === "spend:first_top_up"),
    ).toMatchObject({
        pollenCredited: 2,
        balanceBucket: "pack",
        legacy: false,
    });
});

test("account quest history includes legacy GitHub quest payouts", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const payoutKey = "quest:123:gh:456:role:assignee";

    await db.insert(schema.questPayoutCredits).values({
        payoutKey,
        questIssueNumber: 123,
        prNumber: 789,
        role: "assignee",
        githubUsername: "octocat",
        userId: user.id,
        pollenCredited: 5,
        createdAt: new Date(),
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        totalPollen: number;
        grants: {
            idempotencyKey: string;
            questId: string | null;
            pollenCredited: number;
            legacy: boolean;
            questIssueNumber: number | null;
            prNumber: number | null;
        }[];
    };

    expect(payload.totalPollen).toBe(5);
    expect(payload.grants).toHaveLength(1);
    expect(payload.grants[0]).toMatchObject({
        idempotencyKey: payoutKey,
        questId: "github:123",
        pollenCredited: 5,
        legacy: true,
        questIssueNumber: 123,
        prNumber: 789,
    });
});

test("account quest history requires account usage permission for API keys", async ({
    apiKey,
}) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests",
        {
            headers: {
                authorization: `Bearer ${apiKey}`,
            },
        },
    );

    expect(response.status).toBe(403);
});
