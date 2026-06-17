import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/reward-grants.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
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

test("grantReward credits once and appears in account quest history", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();

    const first = await grantReward(db, {
        idempotencyKey: `quest:first_api_key:${user.id}`,
        userId: user.id,
        source: "onboarding",
        questId: "onboarding:first_api_key",
        amount: 0.5,
        balanceBucket: "pack",
        sourceRef: "apikey:test",
        metadata: { title: "Create first API key" },
    });
    expect(first.granted).toBe(true);
    expect(first.newBalance).toBeCloseTo((user.packBalance ?? 0) + 0.5);

    const duplicate = await grantReward(db, {
        idempotencyKey: `quest:first_api_key:${user.id}`,
        userId: user.id,
        source: "onboarding",
        questId: "onboarding:first_api_key",
        amount: 0.5,
        balanceBucket: "pack",
        sourceRef: "apikey:test",
        metadata: { title: "Create first API key" },
    });
    expect(duplicate.granted).toBe(false);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 0.5);

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
            source: string;
            questId: string | null;
            amount: number;
            balanceBucket: string;
            metadata: { title?: string } | null;
            legacy: boolean;
        }[];
    };

    expect(payload.totalPollen).toBeCloseTo(0.5);
    expect(payload.grants).toHaveLength(1);
    expect(payload.grants[0]).toMatchObject({
        idempotencyKey: `quest:first_api_key:${user.id}`,
        source: "onboarding",
        questId: "onboarding:first_api_key",
        amount: 0.5,
        balanceBucket: "pack",
        legacy: false,
    });
    expect(payload.grants[0]?.metadata?.title).toBe("Create first API key");
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
            amount: number;
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
        amount: 5,
        legacy: true,
        questIssueNumber: 123,
        prNumber: 789,
    });
});
