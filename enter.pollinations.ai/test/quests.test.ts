import { env, SELF } from "cloudflare:test";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { runQuestEvaluator } from "../src/services/quest-evaluator.ts";
import * as questIndex from "../src/services/quests/index.ts";
import type {
    QuestEvaluationContext,
    QuestGroup,
} from "../src/services/quests/types.ts";
import { test } from "./fixtures.ts";

// The evaluator records `scanned` as the number of reward proposals a quest's
// source still produces, recorded BEFORE the
// generic dedup. So a quest whose source row persists keeps `scanned: 1` on a
// re-run; only `granted` drops to 0 once the reward is already paid. (The old
// evaluator deducted dedup before counting, so re-runs reported `scanned: 0`.)
const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";
const ELIXPO_INTERN_ALREADY_GRANTED = {
    questId: ELIXPO_INTERN_QUEST_ID,
    scanned: 1,
    granted: 0,
};

// Number of static "product" catalog cards. Every static group quest
// serializes to exactly one uniform card; the github-contributions group is the
// only dynamic one (one card per seeded github_quest_issues row, zero when none).
// We snapshot the static count by loading the catalog with no issues seeded.
async function countStaticQuestCards(): Promise<number> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const cards = await questIndex.listQuestCards(ctx);
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
    await env.KV.delete("quests:catalog:v8");
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
        category: "build",
        availability: "available",
        rewardAmount: 15,
        url: "https://github.com/pollinations/pollinations/issues/321",
    });
    // Issue 322 is "claimed" (assigned, in progress) → off the open board, so
    // its card is availability "completed" (the frontend then shows it only to
    // whoever earns it).
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:322"),
    ).toMatchObject({
        title: "Fix a model config",
        iconId: "github",
        category: "build",
        availability: "completed",
        rewardAmount: 20,
        url: "https://github.com/pollinations/pollinations/issues/322",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:323"),
    ).toMatchObject({
        title: "Malformed reward heading",
        iconId: "github",
        category: "build",
        availability: "available",
        rewardAmount: 0,
        url: "https://github.com/pollinations/pollinations/issues/323",
    });
    // The uniform card shape dropped the old board-state fields.
    for (const quest of payload.quests) {
        expect(quest).not.toHaveProperty("kind");
        expect(quest).not.toHaveProperty("assignees");
        expect(quest).not.toHaveProperty("sortKey");
    }
});

test("GET /api/quests/catalog returns product quests with no materialized GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v8");
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
            (quest) => quest.id === "onboarding:established_github_account",
        ),
    ).toMatchObject({
        iconId: "github",
        category: "build",
        availability: "available",
    });
    // The elixpo easter egg is still emitted into the catalog (so a grant can
    // join to it) but is off the open board (availability "completed"), so the
    // frontend hides it until the target account earns it.
    expect(
        payload.quests.find((quest) => quest.id === "easteregg:elixpo_intern"),
    ).toMatchObject({
        iconId: "sprout",
        category: "easteregg",
        availability: "completed",
    });
    expect(
        payload.quests.some((quest) => quest.id.startsWith("github:issue:")),
    ).toBe(false);
});

test("grantReward dedups on idempotency key and credits distinct keys", async ({
    sessionToken: _sessionToken,
}) => {
    // grantReward is the generic idempotent write: it pays a key once and pays
    // distinct keys independently. Quest scope (perUser/once) decides the key
    // SHAPE upstream in toGrant; here we verify the write path treats any two
    // keys independently and collapses repeats of one.
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

    // First run grants the three eligible product quests; assert only those
    // (targeted, so adding/removing unrelated quests never breaks this test).
    const first = await runQuestEvaluator(env);
    for (const questId of [
        "onboarding:first_api_key",
        "spend:first_top_up",
        "onboarding:established_github_account",
    ]) {
        expect(first.results).toContainEqual({
            questId,
            scanned: 1,
            granted: 1,
        });
    }

    // Second run: source rows persist so the same proposals are emitted
    // (scanned: 1), but the idempotent grant dedups them (granted: 0) and the
    // balance is unchanged.
    const second = await runQuestEvaluator(env);
    for (const questId of [
        "onboarding:first_api_key",
        "spend:first_top_up",
        "onboarding:established_github_account",
    ]) {
        expect(second.results).toContainEqual({
            questId,
            scanned: 1,
            granted: 0,
        });
    }

    const [balance] = await db
        .select({ packBalance: schema.user.packBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.packBalance).toBeCloseTo((user.packBalance ?? 0) + 12);

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

    expect(payload.totalPollen).toBeCloseTo(12);
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
        pollenCredited: 5,
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
        title: "Senior dev status",
    });
});

test("quest evaluator continues after one quest fails", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    await mocks.enable("github", "tinybird");

    const failingGroup: QuestGroup = {
        id: "test-failing",
        async listQuestCards() {
            return [];
        },
        async findRewardProposals(): Promise<never> {
            throw new Error("planned quest failure");
        },
    };

    questIndex.QUEST_GROUPS.unshift(failingGroup);
    try {
        const result = await runQuestEvaluator(env);
        expect(result.success).toBe(false);
        expect(result.results).toContainEqual({
            questId: "group:test-failing",
            scanned: 0,
            granted: 0,
            error: "planned quest failure",
        });
        expect(result.results.map((entry) => entry.questId)).toContain(
            "spend:first_top_up",
        );
    } finally {
        questIndex.QUEST_GROUPS.shift();
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

    // A brand-new GitHub account is below the age threshold, so the
    // established-account quest proposes nothing and grants nothing. Assert just
    // that quest (targeted) plus an unchanged balance.
    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: "onboarding:established_github_account",
        scanned: 0,
        granted: 0,
    });

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

    // Each issue is its own scope:"once" quest; the completed-and-payable issue
    // produces exactly one result entry at id `github:issue:777` that pays out.
    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: issueQuestId,
        scanned: 1,
        granted: 1,
    });

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

    // Second run: the issue is now assigned to a DIFFERENT user, so the
    // issue-quest still emits one candidate (scanned: 1) — pointing at the new
    // assignee. But scope:"once" means toGrant derives the SAME userId-free key
    // `quest:github:issue:777`, which was already paid on the first run. The
    // generic dedup drops it (granted: 0). Reassigning an issue never pays it a
    // second time: one issue, one payout, regardless of who is assigned.
    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual({
        questId: issueQuestId,
        scanned: 1,
        granted: 0,
    });

    // The original assignee keeps the single payout; the reassigned user gets
    // nothing (the issue was already paid once).
    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo((user.tierBalance ?? 0) + 17);
    const [otherBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.githubId, otherGithubId));
    expect(otherBalance?.tierBalance).toBeCloseTo(0);

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

    // scope:"once" idempotency: exactly one grant, keyed WITHOUT a userId, owned
    // by the original assignee who triggered the first payout.
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
        idempotencyKey: `quest:github:issue:${issueNumber}`,
        userId: user.id,
        title: issueTitle,
        pollenCredited: 17,
        balanceBucket: "tier",
    });
});

// Regression guard for the idempotency-key collapse: PRODUCTION fills
// github_quest_issues.quest_id with ONE shared constant
// ("github:community_issue_quest") for every community issue (see
// .github/scripts/quest-reward-payout.js). The quest id MUST therefore be
// derived from the per-issue PK (issueNumber), NOT from quest_id — otherwise
// every scope:"once" bounty keys to the same `quest:github:community_issue_quest`
// and only the first one ever pays. This test reproduces the production data
// shape (two issues, same quest_id) and asserts BOTH pay out independently.
test("two community issues sharing one quest_id each pay out (production key shape)", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    // The single shared discriminator the payout script writes for ALL issues.
    const SHARED_QUEST_ID = "github:community_issue_quest";

    const secondGithubId = 424242;
    await db.insert(schema.user).values({
        id: "community-issue-second-user",
        name: "Second Dev",
        email: "second-dev@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: secondGithubId,
        githubUsername: "second-dev",
        tier: "spore",
        tierBalance: 0,
        packBalance: 0,
    });

    const issues = [
        { issueNumber: 901, assigneeGithubId: user.githubId, reward: 11 },
        { issueNumber: 902, assigneeGithubId: secondGithubId, reward: 13 },
    ];
    for (const issue of issues) {
        await db.insert(schema.githubQuestIssues).values({
            issueNumber: issue.issueNumber,
            // BOTH rows carry the same shared quest_id, exactly like production.
            questId: SHARED_QUEST_ID,
            title: `Community bounty #${issue.issueNumber}`,
            description: "Merge the linked PR.",
            url: `https://github.com/pollinations/pollinations/issues/${issue.issueNumber}`,
            rewardAmount: issue.reward,
            balanceBucket: "pack",
            state: "completed",
            assigneeGithubId: issue.assigneeGithubId,
            assigneeLogin: "dev",
            assigneesJson: JSON.stringify(["dev"]),
            completedByPrNumber: issue.issueNumber + 1000,
            completedAt: new Date("2026-06-12T00:00:00Z"),
            githubCreatedAt: new Date("2026-06-10T00:00:00Z"),
            githubUpdatedAt: new Date("2026-06-12T00:00:00Z"),
        });
    }

    await runQuestEvaluator(env);

    // Each issue keys by its own PK, so two DISTINCT grants land — not one. The
    // grant's questId snapshots the per-issue quest id (NOT the shared column),
    // so the two grants carry github:issue:901 / :902 and key independently.
    const grants = await db
        .select({
            idempotencyKey: schema.rewardGrants.idempotencyKey,
            userId: schema.rewardGrants.userId,
            pollenCredited: schema.rewardGrants.pollenCredited,
        })
        .from(schema.rewardGrants)
        .where(eq(schema.rewardGrants.balanceBucket, "pack"));

    // Assert on the ISSUE grants specifically (not total balance), so any
    // unrelated quest that happens to also pay these users never breaks this
    // guard (it scopes the assertion to the github:issue:* grants under test).
    const issueGrants = grants.filter((g) =>
        g.idempotencyKey.startsWith("quest:github:issue:"),
    );
    expect(issueGrants).toHaveLength(2);
    expect(issueGrants.map((g) => g.idempotencyKey).sort()).toEqual([
        "quest:github:issue:901",
        "quest:github:issue:902",
    ]);
    // Both assignees were credited their own issue's reward (901→user, 902→other).
    expect(
        issueGrants.find((g) => g.userId === user.id)?.pollenCredited,
    ).toBeCloseTo(11);
    expect(
        issueGrants.find((g) => g.userId === "community-issue-second-user")
            ?.pollenCredited,
    ).toBeCloseTo(13);
});

test("account quest history includes GitHub quest reward grants", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const issueNumber = 123;
    const issueQuestId = `github:issue:${issueNumber}`;
    // scope:"once" issue grants are keyed without a userId.
    const payoutKey = `quest:github:issue:${issueNumber}`;

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
