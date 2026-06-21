import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGitHubQuestRewardKey,
    COMMUNITY_GITHUB_QUEST_ID,
    GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
    GITHUB_QUEST_REWARD_SOURCE,
    PRODUCT_QUEST_REWARD_SOURCE,
} from "@shared/quests/definitions.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { runQuestEvaluator } from "../src/services/quest-evaluator.ts";
import { QUESTS, type QuestModule } from "../src/services/quests/index.ts";
import { test } from "./fixtures.ts";

const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";
const NO_ELIXPO_INTERN_RESULT = {
    questId: ELIXPO_INTERN_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const WEEKLY_TOP_UP_QUEST_ID = "spend:weekly_three_top_ups";
const NO_WEEKLY_TOP_UP_RESULT = {
    questId: WEEKLY_TOP_UP_QUEST_ID,
    scanned: 0,
    granted: 0,
};

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

test("GET /api/quests/catalog returns product and GitHub issue quests", async () => {
    await env.KV.delete("quests:catalog:v3");
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
        },
    ]);

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            kind: string;
            availability: string;
            rewardAmount: number | null;
            url: string | null;
            assignees?: string[];
        }[];
    };

    expect(
        payload.quests.filter(
            (quest) =>
                quest.kind === "product" && quest.availability === "available",
        ),
    ).toHaveLength(4);
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({
        kind: "product",
        availability: "available",
        rewardAmount: 1,
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:321"),
    ).toMatchObject({
        kind: "github_issue",
        availability: "available",
        rewardAmount: 15,
        url: "https://github.com/pollinations/pollinations/issues/321",
        assignees: [],
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:322"),
    ).toMatchObject({
        kind: "github_issue",
        availability: "claimed",
        rewardAmount: 20,
        url: "https://github.com/pollinations/pollinations/issues/322",
        assignees: ["dev-user"],
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:323"),
    ).toMatchObject({
        kind: "github_issue",
        availability: "available",
        rewardAmount: null,
        url: "https://github.com/pollinations/pollinations/issues/323",
        assignees: [],
    });
    expect(
        payload.quests.some(
            (quest) => quest.id === "grow:list_app_on_pollinations",
        ),
    ).toBe(false);
});

test("GET /api/quests/catalog returns product quests with no materialized GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v3");

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
    expect(
        payload.quests.some(
            (quest) => quest.id === "grow:list_app_on_pollinations",
        ),
    ).toBe(false);
    expect(payload.quests.some((quest) => quest.kind === "github_issue")).toBe(
        false,
    );
});

test("per-event reward keys pay once per event", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const questId = "github:merged_pr_author";
    const rewardAmount = 1;
    const bucket = "pack";

    const firstEventKey = `quest:${questId}:user:${user.id}:event:pr-123`;
    const secondEventKey = `quest:${questId}:user:${user.id}:event:pr-124`;

    const first = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: "test_quest",
        questId,
        amount: rewardAmount,
        bucket,
        sourceRef: "pr:123",
    });
    const duplicate = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        source: "test_quest",
        questId,
        amount: rewardAmount,
        bucket,
        sourceRef: "pr:123",
    });
    const secondEvent = await grantReward(db, {
        idempotencyKey: secondEventKey,
        userId: user.id,
        source: "test_quest",
        questId,
        amount: rewardAmount,
        bucket,
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
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
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

test("quest evaluator grants weekly top-up quest once per week", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    const now = Date.now();
    await env.DB.batch(
        [1, 2, 3].map((index) =>
            env.DB.prepare(
                `INSERT INTO stripe_checkout_credits (
                    session_id,
                    event_id,
                    event_type,
                    user_id,
                    pollen_credited,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            ).bind(
                `cs_weekly_${user.id}_${index}`,
                `evt_weekly_${user.id}_${index}`,
                "checkout.session.completed",
                user.id,
                10,
                now,
            ),
        ),
    );

    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: WEEKLY_TOP_UP_QUEST_ID,
        scanned: 1,
        granted: 1,
    });

    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual(NO_WEEKLY_TOP_UP_RESULT);

    const grants = await db
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
        .where(eq(schema.rewardGrants.questId, WEEKLY_TOP_UP_QUEST_ID));

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 1,
        balanceBucket: "pack",
        sourceRef: `cs_weekly_${user.id}_1`,
    });
    expect(grants[0].idempotencyKey).toContain(
        `quest:${WEEKLY_TOP_UP_QUEST_ID}:user:${user.id}:week:`,
    );
    expect(JSON.parse(grants[0].metadataJson ?? "{}")).toMatchObject({
        title: "Top up three times this week",
        purchaseCount: 3,
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
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo(user.packBalance ?? 0);
});

test("quest evaluator grants elixpo intern easter egg once", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await db
        .update(schema.user)
        .set({
            githubId: 161_109_909,
            githubUsername: "elixpo",
        })
        .where(eq(schema.user.id, user.id));

    mocks.github.state.user = {
        ...mocks.github.state.user,
        id: 161_109_909,
        login: "elixpo",
        name: "elixpo",
        avatar_url: "https://avatars.githubusercontent.com/u/161109909?v=4",
    };
    await mocks.enable("github", "tinybird");

    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: ELIXPO_INTERN_QUEST_ID,
        scanned: 1,
        granted: 1,
    });

    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual(NO_ELIXPO_INTERN_RESULT);

    const grants = await db
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
        .where(eq(schema.rewardGrants.questId, ELIXPO_INTERN_QUEST_ID));

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
        idempotencyKey: `quest:${ELIXPO_INTERN_QUEST_ID}:user:${user.id}`,
        source: PRODUCT_QUEST_REWARD_SOURCE,
        pollenCredited: 10,
        balanceBucket: "pack",
        sourceRef: "github:161109909",
    });
    expect(JSON.parse(grants[0].metadataJson ?? "{}")).toMatchObject({
        title: "Welcome intern, elixpo",
        message: "Congrats on becoming a Pollinations intern, elixpo.",
        githubId: 161_109_909,
        githubUsername: "elixpo",
    });
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
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 1 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
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
    });

    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 1, granted: 1 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const otherGithubId = 987654;
    await db.insert(schema.user).values({
        id: "github-quest-other-user",
        name: "Other Dev",
        email: "other-dev@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: otherGithubId,
        githubUsername: "other-dev",
        tier: "spore",
        tierBalance: 0,
        packBalance: 0,
    });
    await db
        .update(schema.githubQuestIssues)
        .set({
            assigneeGithubId: otherGithubId,
            assigneeLogin: "other-dev",
            assigneesJson: JSON.stringify(["other-dev"]),
            githubUpdatedAt: new Date("2026-06-13T00:00:00Z"),
        })
        .where(eq(schema.githubQuestIssues.issueNumber, 777));

    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        NO_WEEKLY_TOP_UP_RESULT,
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        { questId: COMMUNITY_GITHUB_QUEST_ID, scanned: 0, granted: 0 },
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo((user.tierBalance ?? 0) + 17);
    const [otherBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.githubId, otherGithubId));
    expect(otherBalance?.tierBalance).toBe(0);

    const grants = await db
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

    expect(grants).toHaveLength(1);
    const grant = grants[0];
    expect(grant).toMatchObject({
        idempotencyKey: buildGitHubQuestRewardKey({
            issueNumber: 777,
        }),
        source: GITHUB_QUEST_REWARD_SOURCE,
        pollenCredited: 17,
        balanceBucket: "tier",
        sourceRef: "pr:888",
    });
    expect(JSON.parse(grant.metadataJson ?? "{}")).toMatchObject({
        title: "Complete a GitHub quest issue",
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
    const payoutKey = "quest:123";

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
