import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGrantKey,
    getQuestDefinition,
    type QuestDefinition,
} from "@shared/quests/definitions.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import {
    buildQuestGrantMetadata,
    runQuestEvaluator,
} from "../src/services/quest-evaluator.ts";
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

const mergedPrQuest: QuestDefinition = {
    id: "github:merged_pr_author",
    title: "Merge a pull request",
    description: "Earn Pollen when your pull request is merged.",
    category: "build",
    status: "planned",
    eventType: "github_pr_merged",
    rewardAmount: 1,
    balanceBucket: "pack",
    payoutScope: "once_per_event_per_user",
};

test("GET /api/quests/catalog returns checked-in launch catalog", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            status: string;
            eventType: string;
            balanceBucket: string;
            payoutScope: string;
        }[];
    };

    expect(
        payload.quests.filter((quest) => quest.status === "active"),
    ).toHaveLength(2);
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({
        eventType: "api_key_created",
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "onboarding:first_image_generation",
        ),
    ).toMatchObject({
        eventType: "first_image_generation",
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    });
});

test("buildGrantKey ignores eventId for once-per-user quests", () => {
    const definition = getQuestDefinition("onboarding:first_api_key");
    if (!definition) throw new Error("missing test quest definition");

    expect(
        buildGrantKey(definition, {
            userId: "user-1",
            eventId: "ignored-event",
        }),
    ).toBe("quest:onboarding:first_api_key:user:user-1");
});

test("buildGrantKey requires eventId for per-event quests", () => {
    expect(() =>
        buildGrantKey(mergedPrQuest, {
            userId: "user-1",
        }),
    ).toThrow(/eventId/);

    expect(
        buildGrantKey(mergedPrQuest, {
            userId: "user-1",
            eventId: "pr-123",
        }),
    ).toBe("quest:github:merged_pr_author:user:user-1:event:pr-123");
});

test("quest grant metadata keeps definition fields authoritative", () => {
    expect(
        buildQuestGrantMetadata(mergedPrQuest, {
            userId: "user-1",
            metadata: {
                title: "Overridden title",
                category: "engage",
                eventType: "manual",
                externalUrl:
                    "https://github.com/pollinations/pollinations/pull/123",
            },
        }),
    ).toEqual({
        title: "Merge a pull request",
        category: "build",
        eventType: "github_pr_merged",
        externalUrl: "https://github.com/pollinations/pollinations/pull/123",
    });
});

test("per-event grant keys pay once per event", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();

    const firstEventKey = buildGrantKey(mergedPrQuest, {
        userId: user.id,
        eventId: "pr-123",
    });
    const secondEventKey = buildGrantKey(mergedPrQuest, {
        userId: user.id,
        eventId: "pr-124",
    });

    const first = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: mergedPrQuest.eventType,
        questId: mergedPrQuest.id,
        amount: mergedPrQuest.rewardAmount,
        bucket: mergedPrQuest.balanceBucket,
        sourceRef: "pr:123",
    });
    const duplicate = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: mergedPrQuest.eventType,
        questId: mergedPrQuest.id,
        amount: mergedPrQuest.rewardAmount,
        bucket: mergedPrQuest.balanceBucket,
        sourceRef: "pr:123",
    });
    const secondEvent = await grantReward(db, {
        idempotencyKey: secondEventKey,
        userId: user.id,
        source: mergedPrQuest.eventType,
        questId: mergedPrQuest.id,
        amount: mergedPrQuest.rewardAmount,
        bucket: mergedPrQuest.balanceBucket,
        sourceRef: "pr:124",
    });

    expect(first.granted).toBe(true);
    expect(duplicate.granted).toBe(false);
    expect(secondEvent.granted).toBe(true);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 2);
});

test("quest evaluator grants code-defined product quests once", async ({
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
            source: string;
            questId: string | null;
            pollenCredited: number;
            balanceBucket: string;
        }[];
    };

    expect(payload.totalPollen).toBeCloseTo(2.5);
    expect(payload.grants).toHaveLength(2);
    for (const grant of payload.grants) {
        expect(grant).not.toHaveProperty("id");
        expect(grant).not.toHaveProperty("idempotencyKey");
    }
    expect(
        payload.grants.find(
            (grant) => grant.questId === "onboarding:first_api_key",
        ),
    ).toMatchObject({
        source: "product_quest",
        pollenCredited: 0.5,
        balanceBucket: "pack",
    });
    expect(
        payload.grants.find((grant) => grant.questId === "spend:first_top_up"),
    ).toMatchObject({
        source: "product_quest",
        pollenCredited: 2,
        balanceBucket: "pack",
    });
});

test("account quest history includes GitHub quest reward grants", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const payoutKey = "quest:123:gh:456:role:assignee";

    await db.insert(schema.rewardGrants).values({
        id: payoutKey,
        idempotencyKey: payoutKey,
        userId: user.id,
        source: "code_quest",
        questId: "github:community_issue_quest",
        pollenCredited: 5,
        balanceBucket: "pack",
        sourceRef: "pr:789",
        metadataJson: JSON.stringify({
            questTypeId: "github:community_issue_quest",
            issueNumber: 123,
            prNumber: 789,
            role: "assignee",
            githubUsername: "octocat",
        }),
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
            questId: string | null;
            pollenCredited: number;
            sourceRef: string | null;
            metadata: Record<string, unknown> | null;
        }[];
    };

    expect(payload.totalPollen).toBe(5);
    expect(payload.grants).toHaveLength(1);
    expect(payload.grants[0]).not.toHaveProperty("id");
    expect(payload.grants[0]).not.toHaveProperty("idempotencyKey");
    expect(payload.grants[0]).toMatchObject({
        questId: "github:community_issue_quest",
        pollenCredited: 5,
        sourceRef: "pr:789",
        metadata: {
            questTypeId: "github:community_issue_quest",
            issueNumber: 123,
            prNumber: 789,
            role: "assignee",
            githubUsername: "octocat",
        },
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
