import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect, vi } from "vitest";
import { runQuestEvaluator } from "../src/services/quest-evaluator.ts";
import * as questIndex from "../src/services/quests/index.ts";
import type {
    Quest,
    QuestEvaluationContext,
} from "../src/services/quests/types.ts";
import { test } from "./fixtures.ts";

// The migrated evaluator records `scanned = findRewards(...).length` — the
// number of CANDIDATES a quest's source still produces, recorded BEFORE the
// generic dedup. So a quest whose source row persists keeps `scanned: 1` on a
// re-run; only `granted` drops to 0 once the reward is already paid. (The old
// evaluator deducted dedup before counting, so re-runs reported `scanned: 0`.)
const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";
const NO_ELIXPO_INTERN_RESULT = {
    questId: ELIXPO_INTERN_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const ELIXPO_INTERN_ALREADY_GRANTED = {
    questId: ELIXPO_INTERN_QUEST_ID,
    scanned: 1,
    granted: 0,
};
const FIRST_IMAGE_QUEST_ID = "onboarding:first_image";
const NO_FIRST_IMAGE_RESULT = {
    questId: FIRST_IMAGE_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const FIRST_CHAT_COMPLETION_QUEST_ID = "onboarding:first_chat_completion";
const NO_FIRST_CHAT_COMPLETION_RESULT = {
    questId: FIRST_CHAT_COMPLETION_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const TRY_THREE_MODELS_QUEST_ID = "onboarding:try_three_models";
const NO_TRY_THREE_MODELS_RESULT = {
    questId: TRY_THREE_MODELS_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const GITHUB_PUBLIC_REPOS_QUEST_ID = "engage:github_2_public_repos";
const NO_GITHUB_PUBLIC_REPOS_RESULT = {
    questId: GITHUB_PUBLIC_REPOS_QUEST_ID,
    scanned: 0,
    granted: 0,
};
const GITHUB_REPO_STARS_QUEST_ID = "engage:github_50_repo_stars";
const NO_GITHUB_REPO_STARS_RESULT = {
    questId: GITHUB_REPO_STARS_QUEST_ID,
    scanned: 0,
    granted: 0,
};

// Number of static "product" catalog cards. Every static group quest
// serializes to exactly one uniform card; the github-issues group is the only
// dynamic group (one card per seeded github_quest_issues row, zero when none).
// We snapshot the static count by loading the catalog with no issues seeded.
async function countStaticQuestCards(): Promise<number> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const cards = await questIndex.loadQuestCards(ctx);
    return cards.filter((card) => !card.id.startsWith("github:issue:")).length;
}

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
    await env.KV.delete("quests:catalog:v6");
    const staticCardCount = await countStaticQuestCards();
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.githubQuestIssues).values([
        {
            issueNumber: 321,
            questId: "github:issue:321",
            title: "Add a demo app",
            description: "Build a focused demo.",
            url: "https://github.com/pollinations/pollinations/issues/321",
            rewardAmount: 15,
            balanceBucket: "pack",
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
            questId: "github:issue:322",
            title: "Fix a model config",
            description: "Wire the missing config.",
            url: "https://github.com/pollinations/pollinations/issues/322",
            rewardAmount: 20,
            balanceBucket: "pack",
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
            questId: "github:issue:323",
            title: "Malformed reward heading",
            description: "Check reward parsing.",
            url: "https://github.com/pollinations/pollinations/issues/323",
            rewardAmount: null,
            balanceBucket: "pack",
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
            title: string;
            description: string;
            iconId: string;
            category: string;
            availability: string;
            rewardAmount: number | null;
            url: string | null;
        }[];
    };

    // Static product cards plus one card per seeded issue row.
    expect(payload.quests).toHaveLength(staticCardCount + 3);
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({
        title: "Mint your first key",
        iconId: "key",
        category: "plant",
        availability: "available",
        rewardAmount: 1,
        url: null,
    });
    // Each issue is now its own uniform quest card (no kind/assignees/sortKey).
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:321"),
    ).toMatchObject({
        title: "Add a demo app",
        iconId: "github",
        category: "community",
        availability: "available",
        rewardAmount: 15,
        url: "https://github.com/pollinations/pollinations/issues/321",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:322"),
    ).toMatchObject({
        title: "Fix a model config",
        iconId: "github",
        category: "community",
        availability: "available",
        rewardAmount: 20,
        url: "https://github.com/pollinations/pollinations/issues/322",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:323"),
    ).toMatchObject({
        title: "Malformed reward heading",
        iconId: "github",
        category: "community",
        availability: "available",
        rewardAmount: 0,
        url: "https://github.com/pollinations/pollinations/issues/323",
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "grow:list_app_on_pollinations",
        ),
    ).toMatchObject({
        title: "List an app on Pollinations",
        iconId: "app",
        category: "grow",
        availability: "available",
        rewardAmount: 5,
    });
    // The uniform card shape dropped the old board-state fields.
    for (const quest of payload.quests) {
        expect(quest).not.toHaveProperty("kind");
        expect(quest).not.toHaveProperty("assignees");
        expect(quest).not.toHaveProperty("sortKey");
    }
});

test("GET /api/quests/catalog returns product quests with no materialized GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v6");
    const staticCardCount = await countStaticQuestCards();

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            iconId: string;
            category: string;
            availability: string;
        }[];
    };

    expect(payload.quests).toHaveLength(staticCardCount);
    expect(
        payload.quests.find(
            (quest) => quest.id === "grow:list_app_on_pollinations",
        ),
    ).toMatchObject({
        iconId: "app",
        category: "grow",
        availability: "available",
    });
    expect(
        payload.quests.some((quest) => quest.id.startsWith("github:issue:")),
    ).toBe(false);
});

test("per-event reward keys pay once per event", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const questId = "github:merged_pr_author";
    const title = "Merge a pull request";
    const rewardAmount = 1;
    const bucket = "pack";

    const firstEventKey = `quest:${questId}:user:${user.id}:event:pr-123`;
    const secondEventKey = `quest:${questId}:user:${user.id}:event:pr-124`;

    const first = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
    });
    const duplicate = await grantReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
    });
    const secondEvent = await grantReward(db, {
        idempotencyKey: secondEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
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
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 1, granted: 1 },
        { questId: "spend:first_top_up", scanned: 1, granted: 1 },
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    // Second run: each quest's source rows still exist, so findRewards re-emits
    // the same candidates (scanned: 1). The generic dedup then filters them out,
    // so nothing is granted again (granted: 0) and the balance is unchanged.
    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 1, granted: 0 },
        { questId: "spend:first_top_up", scanned: 1, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 0,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: "grow:list_app_on_pollinations", scanned: 0, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 8);

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
            title: string;
            pollenCredited: number;
            balanceBucket: string;
        }[];
    };

    expect(payload.totalPollen).toBeCloseTo(8);
    expect(payload.grants).toHaveLength(3);
    for (const grant of payload.grants) {
        expect(grant).not.toHaveProperty("id");
        expect(grant).not.toHaveProperty("idempotencyKey");
        expect(grant).not.toHaveProperty("source");
        expect(grant).not.toHaveProperty("sourceRef");
        expect(grant).not.toHaveProperty("metadata");
        expect(grant).not.toHaveProperty("metadataJson");
    }
    expect(
        payload.grants.find(
            (grant) => grant.questId === "onboarding:first_api_key",
        ),
    ).toMatchObject({
        pollenCredited: 1,
        balanceBucket: "pack",
    });
    expect(
        payload.grants.find((grant) => grant.questId === "spend:first_top_up"),
    ).toMatchObject({
        pollenCredited: 1,
        balanceBucket: "pack",
    });
    expect(
        payload.grants.find(
            (grant) =>
                grant.questId === "onboarding:established_github_account",
        ),
    ).toMatchObject({
        pollenCredited: 6,
        balanceBucket: "pack",
        title: "Claim senior dev status",
    });
});

test("quest evaluator grants usage onboarding quests once", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    mocks.tinybird.state.questUsageResponse = [
        {
            userId: user.id,
            firstImageEventId: "evt_first_image",
            imageRequests: 1,
            firstTextEventId: "evt_first_text",
            textRequests: 2,
            distinctModels: 3,
            totalRequests: 3,
            activeDaysLast7: 1,
        },
    ];
    await mocks.enable("github", "tinybird");

    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: FIRST_IMAGE_QUEST_ID,
        scanned: 1,
        granted: 1,
    });
    expect(first.results).toContainEqual({
        questId: FIRST_CHAT_COMPLETION_QUEST_ID,
        scanned: 1,
        granted: 1,
    });
    expect(first.results).toContainEqual({
        questId: TRY_THREE_MODELS_QUEST_ID,
        scanned: 1,
        granted: 1,
    });

    // Second run: the Tinybird usage rows still satisfy each threshold, so the
    // candidates are re-scanned (scanned: 1) but the dedup blocks a second grant.
    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual({
        questId: FIRST_IMAGE_QUEST_ID,
        scanned: 1,
        granted: 0,
    });
    expect(second.results).toContainEqual({
        questId: FIRST_CHAT_COMPLETION_QUEST_ID,
        scanned: 1,
        granted: 0,
    });
    expect(second.results).toContainEqual({
        questId: TRY_THREE_MODELS_QUEST_ID,
        scanned: 1,
        granted: 0,
    });

    const grants = await db
        .select({
            questId: schema.rewardGrants.questId,
            pollenCredited: schema.rewardGrants.pollenCredited,
            balanceBucket: schema.rewardGrants.balanceBucket,
        })
        .from(schema.rewardGrants);

    expect(
        grants.find((grant) => grant.questId === FIRST_IMAGE_QUEST_ID),
    ).toMatchObject({
        pollenCredited: 0.5,
        balanceBucket: "pack",
    });
    expect(
        grants.find(
            (grant) => grant.questId === FIRST_CHAT_COMPLETION_QUEST_ID,
        ),
    ).toMatchObject({
        pollenCredited: 0.5,
        balanceBucket: "pack",
    });
    expect(
        grants.find((grant) => grant.questId === TRY_THREE_MODELS_QUEST_ID),
    ).toMatchObject({
        pollenCredited: 1,
        balanceBucket: "pack",
    });
});

test("quest evaluator continues after one quest fails", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    await mocks.enable("github", "tinybird");

    // A failing quest: a self-contained quest whose findRewards throws. The
    // evaluator must isolate it (record its error, contribute no candidates)
    // and still run every other quest. Groups now expose loadQuests, so we spy
    // on the index loader to append the failing quest for this run only.
    const failingQuest: Quest = {
        id: "test:failing_quest",
        title: "Failing quest",
        description: "Used to verify runner isolation.",
        iconId: "sprout",
        category: "grow",
        rewardAmount: 1,
        balanceBucket: "pack",
        async findRewards(): Promise<never> {
            throw new Error("planned quest failure");
        },
    };

    // Capture the real loader before spying so the mock can delegate to it
    // without recursing.
    const realLoadQuests = questIndex.loadQuests;
    const spy = vi
        .spyOn(questIndex, "loadQuests")
        .mockImplementation(async (ctx) => {
            const quests = await realLoadQuests(ctx);
            return [...quests, failingQuest];
        });
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
        spy.mockRestore();
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
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
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

    // Second run: the elixpo user still matches, so the candidate is re-scanned
    // (scanned: 1) but the already-paid reward is deduped (granted: 0).
    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual(ELIXPO_INTERN_ALREADY_GRANTED);

    const grants = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            questId: schema.rewardGrants.questId,
            title: schema.rewardGrants.title,
            pollenCredited: schema.rewardGrants.pollenCredited,
            balanceBucket: schema.rewardGrants.balanceBucket,
        })
        .from(schema.rewardGrants)
        .where(eq(schema.rewardGrants.questId, ELIXPO_INTERN_QUEST_ID));

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
        idempotencyKey: `quest:${ELIXPO_INTERN_QUEST_ID}:user:${user.id}`,
        title: "Developer Relations Intern, unlocked 🌻",
        pollenCredited: 100,
        balanceBucket: "pack",
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
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 1,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 1 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    // Second run: every quest funnels proposals through excludeExistingRewards,
    // so the already-paid list-app event is filtered out before grantReward.
    // The candidates are still re-scanned (scanned stays at the candidate count),
    // but granted drops to 0; balance and grant count are unchanged.
    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 1,
            granted: 0,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: "grow:list_app_on_pollinations", scanned: 1, granted: 0 },
        NO_ELIXPO_INTERN_RESULT,
    ]);

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 11);

    const grants = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            questId: schema.rewardGrants.questId,
            title: schema.rewardGrants.title,
            pollenCredited: schema.rewardGrants.pollenCredited,
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
        title: "List an app on Pollinations",
        pollenCredited: 5,
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

    const issueNumber = 777;
    const issueQuestId = `github:issue:${issueNumber}`;
    const issueTitle = "Ship a focused fix";

    await db.insert(schema.githubQuestIssues).values({
        issueNumber,
        questId: issueQuestId,
        title: issueTitle,
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

    // Each issue is its own quest now; the completed-and-payable issue produces
    // exactly one result entry at id `github:issue:777`.
    const first = await runQuestEvaluator(env);
    expect(first.results).toEqual([
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: issueQuestId, scanned: 1, granted: 1 },
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
        .where(eq(schema.githubQuestIssues.issueNumber, issueNumber));

    // Second run: the issue is now assigned to a different (existing) user, so
    // the issue-quest still emits one candidate (scanned: 1). But the reward's
    // idempotency key is per-(issue, user) and the ORIGINAL assignee was
    // already paid; the reassigned user's key is fresh, BUT the source row no
    // longer references the original user — so the original payout is not
    // double-spent. The new assignee key
    // (`quest:github:issue:777:user:other-dev`) is granted once.
    const second = await runQuestEvaluator(env);
    expect(second.results).toEqual([
        NO_FIRST_IMAGE_RESULT,
        NO_FIRST_CHAT_COMPLETION_RESULT,
        NO_TRY_THREE_MODELS_RESULT,
        { questId: "onboarding:first_api_key", scanned: 0, granted: 0 },
        { questId: "spend:first_top_up", scanned: 0, granted: 0 },
        {
            questId: "onboarding:established_github_account",
            scanned: 0,
            granted: 0,
        },
        NO_GITHUB_PUBLIC_REPOS_RESULT,
        NO_GITHUB_REPO_STARS_RESULT,
        { questId: issueQuestId, scanned: 1, granted: 1 },
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
    expect(otherBalance?.tierBalance).toBeCloseTo(17);

    const grants = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            questId: schema.rewardGrants.questId,
            title: schema.rewardGrants.title,
            pollenCredited: schema.rewardGrants.pollenCredited,
            balanceBucket: schema.rewardGrants.balanceBucket,
            userId: schema.rewardGrants.userId,
        })
        .from(schema.rewardGrants)
        .where(eq(schema.rewardGrants.questId, issueQuestId));

    // Per-(issue, user) idempotency: the original assignee's grant.
    const originalGrant = grants.find((grant) => grant.userId === user.id);
    expect(originalGrant).toMatchObject({
        idempotencyKey: `quest:github:issue:${issueNumber}:user:${user.id}`,
        title: issueTitle,
        pollenCredited: 17,
        balanceBucket: "tier",
    });
});

test("account quest history includes GitHub quest reward grants", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const issueNumber = 123;
    const issueQuestId = `github:issue:${issueNumber}`;
    const payoutKey = `quest:github:issue:${issueNumber}:user:${user.id}`;

    await db.insert(schema.rewardGrants).values({
        id: payoutKey,
        idempotencyKey: payoutKey,
        userId: user.id,
        questId: issueQuestId,
        title: "Ship a focused fix",
        pollenCredited: 5,
        balanceBucket: "pack",
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
            title: string;
            pollenCredited: number;
            balanceBucket: string;
            createdAt: string;
        }[];
    };

    expect(payload.totalPollen).toBe(5);
    expect(payload.grants).toHaveLength(1);
    expect(payload.grants[0]).not.toHaveProperty("id");
    expect(payload.grants[0]).not.toHaveProperty("idempotencyKey");
    expect(payload.grants[0]).not.toHaveProperty("source");
    expect(payload.grants[0]).not.toHaveProperty("sourceRef");
    expect(payload.grants[0]).not.toHaveProperty("metadata");
    expect(payload.grants[0]).not.toHaveProperty("metadataJson");
    expect(payload.grants[0]).toMatchObject({
        questId: issueQuestId,
        title: "Ship a focused fix",
        pollenCredited: 5,
        balanceBucket: "pack",
    });
    expect(typeof payload.grants[0].createdAt).toBe("string");
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
