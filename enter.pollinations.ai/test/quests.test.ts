import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGitHubQuestRewardKey,
    buildRewardKey,
    COMMUNITY_GITHUB_QUEST_ID,
    GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
    GITHUB_QUEST_PAYOUT_SCOPE,
    GITHUB_QUEST_REWARD_SOURCE,
    PRODUCT_QUEST_REWARD_SOURCE,
    type QuestDefinition,
} from "@shared/quests/definitions.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import {
    buildQuestRewardMetadata,
    runQuestEvaluator,
} from "../src/services/quest-evaluator.ts";
import {
    getQuestDefinition,
    QUESTS,
    type QuestModule,
} from "../src/services/quests/index.ts";
import { test } from "./fixtures.ts";

async function getOnlyUser() {
    const db = drizzle(env.DB, { schema });
    const users = await db
        .select({
            id: schema.user.id,
            githubId: schema.user.githubId,
            packBalance: schema.user.packBalance,
            tierBalance: schema.user.tierBalance,
            githubUsername: schema.user.githubUsername,
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
    rewardAmount: 1,
    balanceBucket: "pack",
    payoutScope: "once_per_event_per_user",
};

test("GET /api/quests/catalog returns product and GitHub issue quests", async () => {
    await env.KV.delete("quests:catalog:v2");
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.githubQuestIssues).values([
        {
            issueNumber: 321,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Add a demo app",
            description: "Build a focused demo.",
            url: "https://github.com/pollinations/pollinations/issues/321",
            rewardAmount: 15,
            balanceBucket: GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
            state: "available",
            assigneeGithubId: null,
            assigneeLogin: null,
            assigneesJson: JSON.stringify([]),
            completedByPrNumber: null,
            completedAt: null,
            githubCreatedAt: new Date("2026-06-01T00:00:00Z"),
            githubUpdatedAt: new Date("2026-06-02T00:00:00Z"),
            metadataJson: null,
        },
        {
            issueNumber: 322,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Fix a model config",
            description: "Wire the missing config.",
            url: "https://github.com/pollinations/pollinations/issues/322",
            rewardAmount: 20,
            balanceBucket: GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
            state: "claimed",
            assigneeGithubId: 999,
            assigneeLogin: "dev-user",
            assigneesJson: JSON.stringify(["dev-user"]),
            completedByPrNumber: null,
            completedAt: null,
            githubCreatedAt: new Date("2026-06-03T00:00:00Z"),
            githubUpdatedAt: new Date("2026-06-04T00:00:00Z"),
            metadataJson: null,
        },
        {
            issueNumber: 323,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Malformed reward heading",
            description: "Check reward parsing.",
            url: "https://github.com/pollinations/pollinations/issues/323",
            rewardAmount: null,
            balanceBucket: GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
            state: "available",
            assigneeGithubId: null,
            assigneeLogin: null,
            assigneesJson: JSON.stringify([]),
            completedByPrNumber: null,
            completedAt: null,
            githubCreatedAt: new Date("2026-06-05T00:00:00Z"),
            githubUpdatedAt: new Date("2026-06-06T00:00:00Z"),
            metadataJson: null,
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        generatedAt: string;
        quests: {
            id: string;
            kind: string;
            questTypeId: string;
            availability: string;
            rewardAmount: number | null;
            balanceBucket: string;
            payoutScope: string;
            issueNumber: number | null;
            assignees: string[];
        }[];
    };

    expect(payload.generatedAt).toEqual(expect.any(String));
    expect(
        payload.quests.filter(
            (quest) =>
                quest.kind === "product" && quest.availability === "available",
        ),
    ).toHaveLength(4);
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "onboarding:established_github_account",
        ),
    ).toMatchObject({
        balanceBucket: "pack",
        payoutScope: "once_per_user",
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "grow:list_app_on_pollinations",
        ),
    ).toMatchObject({
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:321"),
    ).toMatchObject({
        kind: "github_issue",
        questTypeId: COMMUNITY_GITHUB_QUEST_ID,
        availability: "available",
        rewardAmount: 15,
        balanceBucket: "pack",
        payoutScope: GITHUB_QUEST_PAYOUT_SCOPE,
        issueNumber: 321,
        assignees: [],
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:322"),
    ).toMatchObject({
        kind: "github_issue",
        availability: "claimed",
        rewardAmount: 20,
        issueNumber: 322,
        assignees: ["dev-user"],
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:323"),
    ).toMatchObject({
        kind: "github_issue",
        availability: "available",
        rewardAmount: null,
        issueNumber: 323,
        assignees: [],
    });
});

test("GET /api/quests/catalog returns product quests with no materialized GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v2");

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            kind: string;
            availability: string;
        }[];
    };

    expect(
        payload.quests.filter(
            (quest) =>
                quest.kind === "product" && quest.availability === "available",
        ),
    ).toHaveLength(4);
    expect(payload.quests.some((quest) => quest.kind === "github_issue")).toBe(
        false,
    );
});

test("buildRewardKey ignores eventId for once-per-user quests", () => {
    const definition = getQuestDefinition("onboarding:first_api_key");
    if (!definition) throw new Error("missing test quest definition");

    expect(
        buildRewardKey(definition, {
            userId: "user-1",
            eventId: "ignored-event",
        }),
    ).toBe("quest:onboarding:first_api_key:user:user-1");
});

test("buildRewardKey requires eventId for per-event quests", () => {
    expect(() =>
        buildRewardKey(mergedPrQuest, {
            userId: "user-1",
        }),
    ).toThrow(/eventId/);

    expect(
        buildRewardKey(mergedPrQuest, {
            userId: "user-1",
            eventId: "pr-123",
        }),
    ).toBe("quest:github:merged_pr_author:user:user-1:event:pr-123");
});

test("quest reward metadata keeps definition fields authoritative", () => {
    expect(
        buildQuestRewardMetadata(mergedPrQuest, {
            userId: "user-1",
            metadata: {
                title: "Overridden title",
                externalUrl:
                    "https://github.com/pollinations/pollinations/pull/123",
            },
        }),
    ).toEqual({
        title: "Merge a pull request",
        externalUrl: "https://github.com/pollinations/pollinations/pull/123",
    });
});

test("per-event reward keys pay once per event", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();

    const firstEventKey = buildRewardKey(mergedPrQuest, {
        userId: user.id,
        eventId: "pr-123",
    });
    const secondEventKey = buildRewardKey(mergedPrQuest, {
        userId: user.id,
        eventId: "pr-124",
    });

    const first = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: "test_quest",
        questId: mergedPrQuest.id,
        amount: mergedPrQuest.rewardAmount,
        bucket: mergedPrQuest.balanceBucket,
        sourceRef: "pr:123",
    });
    const duplicate = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: "test_quest",
        questId: mergedPrQuest.id,
        amount: mergedPrQuest.rewardAmount,
        bucket: mergedPrQuest.balanceBucket,
        sourceRef: "pr:123",
    });
    const secondEvent = await grantReward(db, {
        idempotencyKey: secondEventKey,
        userId: user.id,
        source: "test_quest",
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
    mocks,
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

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
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 11);

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
            metadata: Record<string, unknown> | null;
        }[];
    };

    expect(payload.totalPollen).toBeCloseTo(11);
    expect(payload.grants).toHaveLength(3);
    for (const grant of payload.grants) {
        expect(grant).not.toHaveProperty("id");
        expect(grant).not.toHaveProperty("idempotencyKey");
    }
    expect(
        payload.grants.find(
            (grant) => grant.questId === "onboarding:first_api_key",
        ),
    ).toMatchObject({
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 1,
        balanceBucket: "pack",
    });
    expect(
        payload.grants.find((grant) => grant.questId === "spend:first_top_up"),
    ).toMatchObject({
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 5,
        balanceBucket: "pack",
    });
    expect(
        payload.grants.find(
            (grant) =>
                grant.questId === "onboarding:established_github_account",
        ),
    ).toMatchObject({
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 5,
        balanceBucket: "pack",
        metadata: {
            githubId: 12345,
            githubAccountCreatedAt: "2018-01-01T00:00:00.000Z",
            thresholdDays: 365,
        },
    });
});

test("quest evaluator continues after one quest fails", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    await mocks.enable("github", "tinybird");

    const failingQuest = {
        definition: {
            id: "test:failing_quest",
            title: "Failing quest",
            description: "Used to verify runner isolation.",
            rewardAmount: 1,
            balanceBucket: "pack",
            payoutScope: "once_per_user",
        },
        async evaluate() {
            throw new Error("planned quest failure");
        },
    } satisfies QuestModule;

    QUESTS.splice(1, 0, failingQuest);
    try {
        const result = await runQuestEvaluator(env);
        expect(result.success).toBe(false);
        expect(result.results).toContainEqual({
            questId: "test:failing_quest",
            scanned: 0,
            granted: 0,
            error: "planned quest failure",
        });
        expect(result.results.map((entry) => entry.questId)).toContain(
            "spend:first_top_up",
        );
    } finally {
        const index = QUESTS.indexOf(failingQuest);
        if (index >= 0) QUESTS.splice(index, 1);
    }
});

test("github account age quest waits until threshold", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo(user.packBalance ?? 0);
});

test("quest evaluator grants approved app quest per app", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.tinybird.state.appDirectoryResponse = [
        {
            name: "Demo App",
            web_url: "https://example.com/demo",
            github_user_id: "12345",
            github_username: "testuser",
            issue_url:
                "https://github.com/pollinations/pollinations/issues/555",
            approved_date: "2026-06-19",
        },
    ];
    await mocks.enable("github", "tinybird");

    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 1 },
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 0 },
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 10);

    const grants = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            source: schema.rewardGrants.source,
            questId: schema.rewardGrants.questId,
            pollenCredited: schema.rewardGrants.pollenCredited,
            sourceRef: schema.rewardGrants.sourceRef,
            metadataJson: schema.rewardGrants.metadataJson,
        })
        .from(schema.rewardGrants)
        .where(
            eq(schema.rewardGrants.questId, "grow:list_app_on_pollinations"),
        );

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
        idempotencyKey:
            "quest:grow:list_app_on_pollinations:user:" +
            user.id +
            ":event:app:https://github.com/pollinations/pollinations/issues/555",
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 5,
        sourceRef: "https://github.com/pollinations/pollinations/issues/555",
    });
    expect(JSON.parse(grants[0].metadataJson ?? "{}")).toMatchObject({
        title: "List an app on Pollinations",
        appName: "Demo App",
        appUrl: "https://example.com/demo",
        issueUrl: "https://github.com/pollinations/pollinations/issues/555",
        githubId: 12345,
        githubUsername: expect.any(String),
    });
});

test("quest evaluator rewards completed GitHub quest issues through shared path", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    await db.insert(schema.githubQuestIssues).values({
        issueNumber: 777,
        questId: COMMUNITY_GITHUB_QUEST_ID,
        title: "Ship a focused fix",
        description: "Merge the quest PR.",
        url: "https://github.com/pollinations/pollinations/issues/777",
        rewardAmount: 17,
        balanceBucket: "tier",
        state: "completed",
        assigneeGithubId: user.githubId,
        assigneeLogin: user.githubUsername,
        assigneesJson: JSON.stringify([user.githubUsername]),
        completedByPrNumber: 888,
        completedAt: new Date("2026-06-12T00:00:00Z"),
        githubCreatedAt: new Date("2026-06-10T00:00:00Z"),
        githubUpdatedAt: new Date("2026-06-12T00:00:00Z"),
        metadataJson: null,
    });

    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 1, granted: 1 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
    ]);

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo((user.tierBalance ?? 0) + 17);

    const [grant] = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            source: schema.rewardGrants.source,
            questId: schema.rewardGrants.questId,
            pollenCredited: schema.rewardGrants.pollenCredited,
            balanceBucket: schema.rewardGrants.balanceBucket,
            sourceRef: schema.rewardGrants.sourceRef,
            metadataJson: schema.rewardGrants.metadataJson,
        })
        .from(schema.rewardGrants)
        .where(eq(schema.rewardGrants.questId, COMMUNITY_GITHUB_QUEST_ID));

    expect(grant).toMatchObject({
        idempotencyKey: buildGitHubQuestRewardKey({
            issueNumber: 777,
            githubId: user.githubId ?? 0,
        }),
        source: GITHUB_QUEST_REWARD_SOURCE,
        pollenCredited: 17,
        balanceBucket: "tier",
        sourceRef: "pr:888",
    });
    expect(JSON.parse(grant.metadataJson ?? "{}")).toMatchObject({
        title: "Complete a GitHub quest issue",
        questTypeId: COMMUNITY_GITHUB_QUEST_ID,
        issueNumber: 777,
        issueTitle: "Ship a focused fix",
        issueUrl: "https://github.com/pollinations/pollinations/issues/777",
        prNumber: 888,
        role: "assignee",
        githubUsername: expect.any(String),
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
        source: GITHUB_QUEST_REWARD_SOURCE,
        questId: COMMUNITY_GITHUB_QUEST_ID,
        pollenCredited: 5,
        balanceBucket: "pack",
        sourceRef: "pr:789",
        metadataJson: JSON.stringify({
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
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
        questId: COMMUNITY_GITHUB_QUEST_ID,
        pollenCredited: 5,
        sourceRef: "pr:789",
        metadata: {
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
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
