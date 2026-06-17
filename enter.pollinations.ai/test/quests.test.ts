import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { runQuestEvaluator } from "@/services/quest-evaluator.ts";
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

test("GET /api/quests returns the checked-in quest catalog", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/quests");
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            status: string;
            rewardAmount: number;
            balanceBucket: string;
        }[];
    };

    expect(payload.quests.map((quest) => quest.id)).toEqual([
        "onboarding:first_api_key",
        "spend:first_top_up",
        "onboarding:first_chat_completion",
        "onboarding:first_image_generation",
    ]);
    expect(
        payload.quests.filter((quest) => quest.status === "active"),
    ).toHaveLength(2);
});

test("GET /api/quests includes D1 quest definitions", async () => {
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

    const response = await SELF.fetch("http://localhost:3000/api/quests");
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            storage: string;
            criteria: { days?: number } | null;
        }[];
    };

    const inserted = payload.quests.find(
        (quest) => quest.id === "engage:seven_day_streak",
    );
    expect(inserted).toMatchObject({
        id: "engage:seven_day_streak",
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
        sessionId: "cs_first_top_up",
        eventId: "evt_first_top_up",
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 10,
        createdAt: new Date(),
    });

    const firstRun = await runQuestEvaluator(env);
    expect(firstRun.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 1, granted: 1 },
        { questId: "spend:first_top_up", scanned: 1, granted: 1 },
    ]);

    const secondRun = await runQuestEvaluator(env);
    expect(secondRun.results).toEqual([
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
        grants: { questId: string | null; amount: number }[];
    };

    expect(payload.totalPollen).toBeCloseTo(2.5);
    expect(payload.grants.map((grant) => grant.questId).sort()).toEqual([
        "onboarding:first_api_key",
        "spend:first_top_up",
    ]);
});
