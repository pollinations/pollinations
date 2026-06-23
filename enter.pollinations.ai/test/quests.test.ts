import { env, SELF } from "cloudflare:test";
import { claimReward, recordReward } from "@shared/billing/rewards.ts";
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
// source still produces, recorded BEFORE the generic dedup. So a quest whose
// source row persists keeps `scanned: 1` on a re-run; only `recorded` drops to 0
// once the reward row already exists.
const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";
const ELIXPO_INTERN_ALREADY_RECORDED = {
    questId: ELIXPO_INTERN_QUEST_ID,
    scanned: 1,
    recorded: 0,
};

// Number of static "product" catalog cards. Every static group quest
// serializes to exactly one uniform card; the github-contributions group is the
// only dynamic one (one card per seeded POLLEN-QUEST gh_issues row, zero when
// none). We snapshot the static count by loading the catalog with no issues
// seeded.
async function countStaticQuestCards(): Promise<number> {
    const ctx: QuestEvaluationContext = {
        db: drizzle(env.DB, { schema }),
        env,
    };
    const cards = await questIndex.listQuestCards(ctx);
    return cards.filter((card) => !card.id.startsWith("github:issue:")).length;
}

// Build an issue body the deriver can parse: a "### Reward" heading (when a
// reward is given) plus a short Goal section for the description.
function questIssueBody(reward: number | null, goal: string): string {
    const rewardBlock = reward !== null ? `### Reward\n${reward}\n\n` : "";
    return `${rewardBlock}### Goal\n${goal}`;
}

type SeedQuestIssue = {
    issueNumber: number;
    title: string;
    goal: string;
    reward: number | null;
    assigneeGithubId?: number | null;
    assigneeLogin?: string | null;
    // When set, a merged PR closes the issue (→ "completed" / payable).
    completedByPrNumber?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
};

// Seed a POLLEN-QUEST bounty into the gh_* mirror exactly as the real mirror
// would: the issue row (label + body), and — when completed — a merged PR plus
// its closing edge. The quest read-path derives everything else from these.
async function seedQuestIssue(
    db: ReturnType<typeof drizzle<typeof schema>>,
    issue: SeedQuestIssue,
): Promise<void> {
    const assigneeGithubId = issue.assigneeGithubId ?? null;
    const assigneeLogin = issue.assigneeLogin ?? null;
    const completedBy = issue.completedByPrNumber ?? null;
    const created = issue.createdAt ?? new Date("2026-06-01T00:00:00Z");
    const updated = issue.updatedAt ?? new Date("2026-06-02T00:00:00Z");

    await db.insert(schema.ghIssues).values({
        number: issue.issueNumber,
        authorGithubId: null,
        authorLogin: null,
        state: completedBy !== null ? "closed" : "open",
        title: issue.title,
        url: `https://github.com/pollinations/pollinations/issues/${issue.issueNumber}`,
        body: questIssueBody(issue.reward, issue.goal),
        labelsJson: JSON.stringify(["POLLEN-QUEST"]),
        assigneeGithubId,
        assigneeLogin,
        assigneesJson: assigneeLogin
            ? JSON.stringify([
                  { login: assigneeLogin, githubId: assigneeGithubId },
              ])
            : JSON.stringify([]),
        githubCreatedAt: created,
        githubClosedAt: completedBy !== null ? updated : null,
        githubUpdatedAt: updated,
    });

    if (completedBy !== null) {
        await db.insert(schema.ghPullRequests).values({
            number: completedBy,
            authorGithubId: assigneeGithubId,
            authorLogin: assigneeLogin,
            state: "merged",
            mergedAt: updated,
            title: `PR closing #${issue.issueNumber}`,
            url: `https://github.com/pollinations/pollinations/pull/${completedBy}`,
            githubCreatedAt: created,
            githubClosedAt: updated,
            githubUpdatedAt: updated,
        });
        await db.insert(schema.ghPrClosingIssues).values({
            edgeKey: `${completedBy}:${issue.issueNumber}`,
            prNumber: completedBy,
            issueNumber: issue.issueNumber,
        });
    }
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
    await env.KV.delete("quests:catalog:v11");
    const staticCardCount = await countStaticQuestCards();
    const db = drizzle(env.DB, { schema });
    await seedQuestIssue(db, {
        issueNumber: 321,
        title: "Add a demo app",
        goal: "Build a focused demo.",
        reward: 15,
    });
    await seedQuestIssue(db, {
        issueNumber: 322,
        title: "Fix a model config",
        goal: "Wire the missing config.",
        reward: 20,
        assigneeGithubId: 999,
        assigneeLogin: "dev-user",
    });
    await seedQuestIssue(db, {
        issueNumber: 323,
        title: "Malformed reward heading",
        goal: "Check reward parsing.",
        reward: null,
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
            title: string;
            description: string;
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
        category: "setup",
        availability: "available",
        rewardAmount: 1,
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "setup:byop_login"),
    ).toMatchObject({
        category: "setup",
        availability: "available",
        rewardAmount: 1,
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "spend:first_top_up"),
    ).toMatchObject({
        category: "grow",
        availability: "available",
        rewardAmount: 5,
        url: null,
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "grow:first_byop_external_user",
        ),
    ).toMatchObject({
        category: "grow",
        availability: "available",
        rewardAmount: 3,
        url: null,
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "grow:first_paid_spend_in_app",
        ),
    ).toMatchObject({
        category: "grow",
        availability: "available",
        rewardAmount: 2,
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:first_merged_pr"),
    ).toMatchObject({
        category: "build",
        availability: "available",
        rewardAmount: 5,
        url: null,
    });
    // Each issue is now its own uniform quest card (no kind/assignees/sortKey).
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:321"),
    ).toMatchObject({
        title: "Add a demo app",
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
        category: "build",
        availability: "completed",
        rewardAmount: 20,
        url: "https://github.com/pollinations/pollinations/issues/322",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:323"),
    ).toMatchObject({
        title: "Malformed reward heading",
        category: "build",
        availability: "available",
        rewardAmount: 0,
        url: "https://github.com/pollinations/pollinations/issues/323",
    });
    // The uniform card shape dropped the old board-state fields.
    for (const quest of payload.quests) {
        expect(quest).not.toHaveProperty("kind");
        expect(quest).not.toHaveProperty("iconId");
        expect(quest).not.toHaveProperty("assignees");
        expect(quest).not.toHaveProperty("sortKey");
    }
});

test("GET /api/quests/catalog returns product quests with no mirrored GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v11");
    const staticCardCount = await countStaticQuestCards();

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
        quests: {
            id: string;
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
        category: "build",
        availability: "available",
    });
    // The elixpo easter egg is still emitted into the catalog (so a reward can
    // join to it) but is off the open board (availability "completed"), so the
    // frontend hides it until the target account earns it.
    expect(
        payload.quests.find((quest) => quest.id === "easteregg:elixpo_intern"),
    ).toMatchObject({
        category: "easteregg",
        availability: "completed",
    });
    expect(
        payload.quests.some((quest) => quest.id.startsWith("github:issue:")),
    ).toBe(false);
});

test("recordReward dedups on idempotency key and claimReward credits once", async ({
    sessionToken: _sessionToken,
}) => {
    // recordReward is the generic idempotent write: it records a key once and
    // records distinct keys independently. claimReward is the only path that
    // credits balance, and it is also idempotent.
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const questId = "github:merged_pr_author";
    const title = "Merge a pull request";
    const rewardAmount = 1;
    const bucket = "tier";

    const firstEventKey = `quest:${questId}:user:${user.id}:event:pr-123`;
    const secondEventKey = `quest:${questId}:user:${user.id}:event:pr-124`;

    const first = await recordReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
    });
    const duplicate = await recordReward(db, {
        idempotencyKey: firstEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
    });
    const secondEvent = await recordReward(db, {
        idempotencyKey: secondEventKey,
        userId: user.id,
        questId,
        title,
        amount: rewardAmount,
        bucket,
    });

    expect(first.recorded).toBe(true);
    expect(duplicate.recorded).toBe(false);
    expect(secondEvent.recorded).toBe(true);

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);

    if (!first.rewardId) throw new Error("Expected recorded reward id");
    const claimed = await claimReward(db, {
        rewardId: first.rewardId,
        userId: user.id,
    });
    const duplicateClaim = await claimReward(db, {
        rewardId: first.rewardId,
        userId: user.id,
    });
    expect(claimed.claimed).toBe(true);
    expect(duplicateClaim.claimed).toBe(false);

    const [claimedBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(claimedBalance?.tierBalance).toBeCloseTo(
        (user.tierBalance ?? 0) + 1,
    );
});

test("quest evaluator records product rewards and claim endpoint credits one", async ({
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

    // First run records the three eligible product rewards; assert only those
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
            recorded: 1,
        });
    }

    // Second run: source rows persist so the same proposals are emitted
    // (scanned: 1), but the idempotent reward insert dedups them (recorded: 0).
    const second = await runQuestEvaluator(env);
    for (const questId of [
        "onboarding:first_api_key",
        "spend:first_top_up",
        "onboarding:established_github_account",
    ]) {
        expect(second.results).toContainEqual({
            questId,
            scanned: 1,
            recorded: 0,
        });
    }

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);

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
        totalClaimedPollen: number;
        totalClaimablePollen: number;
        rewards: {
            id: string;
            questId: string | null;
            title: string;
            pollenAmount: number;
            balanceBucket: string;
            earnedAt: string;
            claimedAt: string | null;
        }[];
    };

    expect(payload.totalClaimedPollen).toBeCloseTo(0);
    expect(payload.totalClaimablePollen).toBeCloseTo(12);
    expect(payload.rewards).toHaveLength(3);
    for (const reward of payload.rewards) {
        expect(reward).not.toHaveProperty("idempotencyKey");
        expect(reward).not.toHaveProperty("source");
        expect(reward).not.toHaveProperty("sourceRef");
        expect(reward).not.toHaveProperty("metadata");
        expect(reward).not.toHaveProperty("metadataJson");
        expect(reward.claimedAt).toBeNull();
        expect(typeof reward.earnedAt).toBe("string");
    }
    const firstApiKeyReward = payload.rewards.find(
        (reward) => reward.questId === "onboarding:first_api_key",
    );
    expect(firstApiKeyReward).toMatchObject({
        pollenAmount: 1,
        balanceBucket: "tier",
    });
    expect(
        payload.rewards.find(
            (reward) => reward.questId === "spend:first_top_up",
        ),
    ).toMatchObject({
        pollenAmount: 5,
        balanceBucket: "tier",
    });
    expect(
        payload.rewards.find(
            (reward) =>
                reward.questId === "onboarding:established_github_account",
        ),
    ).toMatchObject({
        pollenAmount: 6,
        balanceBucket: "tier",
    });

    if (!firstApiKeyReward) throw new Error("Expected first API key reward");
    const claimResponse = await SELF.fetch(
        `http://localhost:3000/api/account/rewards/${firstApiKeyReward.id}/claim`,
        {
            method: "POST",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(claimResponse.status).toBe(200);
    const claimPayload = (await claimResponse.json()) as {
        claimed: boolean;
        reward: { claimedAt: string | null; pollenAmount: number };
    };
    expect(claimPayload.claimed).toBe(true);
    expect(claimPayload.reward.claimedAt).not.toBeNull();
    expect(claimPayload.reward.pollenAmount).toBe(1);

    const [claimedBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(claimedBalance?.tierBalance).toBeCloseTo(
        (user.tierBalance ?? 0) + 1,
    );
});

test("quest evaluator records app growth rewards", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.paidAppSpendResponse = [{ userId: user.id }];

    await db.insert(schema.user).values({
        id: "byop-external-user",
        name: "External User",
        email: "external-user@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: 555001,
        githubUsername: "external-user",
        tier: "spore",
        tierBalance: 0,
        packBalance: 0,
    });
    await db.insert(schema.apikey).values([
        {
            id: "app-key-owner",
            name: "Owner App",
            key: "pk_owner_app",
            prefix: "pk",
            userId: user.id,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: "byop-user-key",
            name: "External BYOP",
            key: "sk_external_byop",
            prefix: "sk",
            userId: "byop-external-user",
            byopClientKeyId: "app-key-owner",
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]);

    const result = await runQuestEvaluator(env);

    expect(result.results).toContainEqual({
        questId: "grow:first_byop_external_user",
        scanned: 1,
        recorded: 1,
    });
    expect(result.results).toContainEqual({
        questId: "grow:first_paid_spend_in_app",
        scanned: 1,
        recorded: 1,
    });
    expect(result.results).toContainEqual({
        questId: "setup:byop_login",
        scanned: 1,
        recorded: 1,
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
            recorded: 0,
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
    // established-account quest proposes nothing and records nothing. Assert just
    // that quest (targeted) plus an unchanged balance.
    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: "onboarding:established_github_account",
        scanned: 0,
        recorded: 0,
    });

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);
});

test("quest evaluator records elixpo intern easter egg once", async ({
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
        recorded: 1,
    });

    // Second run: the elixpo user still matches, so the candidate is re-scanned
    // (scanned: 1) but the already-recorded reward is deduped (recorded: 0).
    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual(ELIXPO_INTERN_ALREADY_RECORDED);

    const rewards = await db
        .select({
            idempotencyKey: schema.rewards.idempotencyKey,
            questId: schema.rewards.questId,
            title: schema.rewards.title,
            pollenAmount: schema.rewards.pollenAmount,
            balanceBucket: schema.rewards.balanceBucket,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, ELIXPO_INTERN_QUEST_ID));

    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
        idempotencyKey: `quest:${ELIXPO_INTERN_QUEST_ID}:user:${user.id}`,
        pollenAmount: 100,
        balanceBucket: "tier",
    });
});

test("quest evaluator records completed GitHub quest issue rewards through shared path", async ({
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

    await seedQuestIssue(db, {
        issueNumber,
        title: issueTitle,
        goal: "Merge the quest PR.",
        reward: 17,
        assigneeGithubId: user.githubId,
        assigneeLogin: user.githubUsername,
        completedByPrNumber: 888,
    });

    // Each issue is its own scope:"once" quest; the completed-and-payable issue
    // produces exactly one result entry at id `github:issue:777`.
    const first = await runQuestEvaluator(env);
    expect(first.results).toContainEqual({
        questId: issueQuestId,
        scanned: 1,
        recorded: 1,
    });
    expect(first.results).toContainEqual({
        questId: "github:first_merged_pr",
        scanned: 1,
        recorded: 1,
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
        .update(schema.ghIssues)
        .set({
            assigneeGithubId: otherGithubId,
            assigneeLogin: "other-dev",
            assigneesJson: JSON.stringify([
                { login: "other-dev", githubId: otherGithubId },
            ]),
            githubUpdatedAt: new Date("2026-06-13T00:00:00Z"),
        })
        .where(eq(schema.ghIssues.number, issueNumber));

    // Second run: the issue is now assigned to a DIFFERENT user, so the
    // issue-quest still emits one candidate (scanned: 1) — pointing at the new
    // assignee. But scope:"once" means toReward derives the SAME userId-free key
    // `quest:github:issue:777`, which was already recorded on the first run. The
    // generic dedup drops it (recorded: 0). Reassigning an issue never records it
    // a second time: one issue, one reward, regardless of who is assigned.
    const second = await runQuestEvaluator(env);
    expect(second.results).toContainEqual({
        questId: issueQuestId,
        scanned: 1,
        recorded: 0,
    });

    // Recording does not credit either balance; pollen moves only when claimed.
    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);
    const [otherBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.githubId, otherGithubId));
    expect(otherBalance?.tierBalance).toBeCloseTo(0);

    const rewards = await db
        .select({
            idempotencyKey: schema.rewards.idempotencyKey,
            questId: schema.rewards.questId,
            title: schema.rewards.title,
            pollenAmount: schema.rewards.pollenAmount,
            balanceBucket: schema.rewards.balanceBucket,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, issueQuestId));

    // scope:"once" idempotency: exactly one reward, keyed WITHOUT a userId, owned
    // by the original assignee who triggered the first recording.
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
        idempotencyKey: `quest:github:issue:${issueNumber}`,
        userId: user.id,
        title: issueTitle,
        pollenAmount: 17,
        balanceBucket: "tier",
    });
});

// Regression guard for the idempotency-key collapse: issue bounty quest ids MUST
// be derived from the issue number. Otherwise every scope:"once" bounty would
// share one key and only the first one ever records.
test("two mirrored issue bounties each record independently", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

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
        await seedQuestIssue(db, {
            issueNumber: issue.issueNumber,
            title: `Community bounty #${issue.issueNumber}`,
            goal: "Merge the linked PR.",
            reward: issue.reward,
            assigneeGithubId: issue.assigneeGithubId,
            assigneeLogin: "dev",
            completedByPrNumber: issue.issueNumber + 1000,
        });
    }

    await runQuestEvaluator(env);

    // Each issue keys by its own PK, so two DISTINCT rewards land — not one. The
    // reward's questId snapshots the per-issue quest id (NOT the shared column),
    // so the two rewards carry github:issue:901 / :902 and key independently.
    const rewards = await db
        .select({
            idempotencyKey: schema.rewards.idempotencyKey,
            userId: schema.rewards.userId,
            pollenAmount: schema.rewards.pollenAmount,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.balanceBucket, "tier"));

    // Assert on the ISSUE rewards specifically (not total balance), so any
    // unrelated quest that happens to also reward these users never breaks this
    // guard (it scopes the assertion to the github:issue:* rewards under test).
    const issueRewards = rewards.filter((g) =>
        g.idempotencyKey.startsWith("quest:github:issue:"),
    );
    expect(issueRewards).toHaveLength(2);
    expect(issueRewards.map((g) => g.idempotencyKey).sort()).toEqual([
        "quest:github:issue:901",
        "quest:github:issue:902",
    ]);
    // Both assignees have their own issue's reward (901→user, 902→other).
    expect(
        issueRewards.find((g) => g.userId === user.id)?.pollenAmount,
    ).toBeCloseTo(11);
    expect(
        issueRewards.find((g) => g.userId === "community-issue-second-user")
            ?.pollenAmount,
    ).toBeCloseTo(13);
});

test("account quest history includes pending and claimed GitHub quest rewards", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const issueNumber = 123;
    const issueQuestId = `github:issue:${issueNumber}`;
    // scope:"once" issue rewards are keyed without a userId.
    const rewardKey = `quest:github:issue:${issueNumber}`;
    const earnedAt = new Date();

    await db.insert(schema.rewards).values({
        id: rewardKey,
        idempotencyKey: rewardKey,
        userId: user.id,
        questId: issueQuestId,
        title: "Ship a focused fix",
        pollenAmount: 5,
        balanceBucket: "tier",
        earnedAt,
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
        totalClaimedPollen: number;
        totalClaimablePollen: number;
        rewards: {
            id: string;
            questId: string | null;
            title: string;
            pollenAmount: number;
            balanceBucket: string;
            earnedAt: string;
            claimedAt: string | null;
        }[];
    };

    expect(payload.totalClaimedPollen).toBe(0);
    expect(payload.totalClaimablePollen).toBe(5);
    expect(payload.rewards).toHaveLength(1);
    expect(payload.rewards[0]).not.toHaveProperty("idempotencyKey");
    expect(payload.rewards[0]).not.toHaveProperty("source");
    expect(payload.rewards[0]).not.toHaveProperty("sourceRef");
    expect(payload.rewards[0]).not.toHaveProperty("metadata");
    expect(payload.rewards[0]).not.toHaveProperty("metadataJson");
    expect(payload.rewards[0]).toMatchObject({
        id: rewardKey,
        questId: issueQuestId,
        title: "Ship a focused fix",
        pollenAmount: 5,
        balanceBucket: "tier",
        claimedAt: null,
    });
    expect(typeof payload.rewards[0].earnedAt).toBe("string");
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
