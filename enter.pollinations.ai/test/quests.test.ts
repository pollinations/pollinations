import { env, SELF } from "cloudflare:test";
import { claimReward, recordReward } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { checkQuestsForUser } from "../src/services/quest-checker.ts";
import * as questIndex from "../src/services/quests/index.ts";
import type { QuestGroup } from "../src/services/quests/types.ts";
import { test } from "./fixtures.ts";
import type { MockGithubState } from "./mocks/github.ts";

const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";

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

// Seed a POLLEN-QUEST bounty into the GitHub mock exactly as the lazy GitHub
// reader sees it: issue fields plus the PRs that GitHub says closed it.
function seedQuestIssue(github: MockGithubState, issue: SeedQuestIssue): void {
    const assigneeGithubId = issue.assigneeGithubId ?? null;
    const assigneeLogin = issue.assigneeLogin ?? null;
    const completedBy = issue.completedByPrNumber ?? null;
    const created = issue.createdAt ?? new Date("2026-06-01T00:00:00Z");
    const updated = issue.updatedAt ?? new Date("2026-06-02T00:00:00Z");

    github.questIssues.push({
        number: issue.issueNumber,
        state: completedBy !== null ? "closed" : "open",
        title: issue.title,
        html_url: `https://github.com/pollinations/pollinations/issues/${issue.issueNumber}`,
        body: questIssueBody(issue.reward, issue.goal),
        created_at: created.toISOString(),
        updated_at: updated.toISOString(),
        closed_at: completedBy !== null ? updated.toISOString() : null,
        user: { login: "maintainer" },
        assignees: assigneeLogin
            ? [{ login: assigneeLogin, databaseId: assigneeGithubId }]
            : [],
        labels: [{ name: "POLLEN-QUEST" }],
        closedByPullRequestsReferences:
            completedBy !== null
                ? [{ number: completedBy, mergedAt: updated.toISOString() }]
                : [],
    });

    if (completedBy !== null && assigneeLogin) {
        github.mergedPullRequests.push({
            number: completedBy,
            authorLogin: assigneeLogin,
            mergedAt: updated.toISOString(),
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

test("catalog stats aggregate earned/claimed from the rewards ledger", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github");
    await env.KV.delete("quests:catalog:v17");
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const questId = "github:first_merged_pr";

    // Two earned rewards for the same quest (distinct idempotency keys), one of
    // which gets claimed. Catalog stats should report earned=2, claimed=1.
    const a = await recordReward(db, {
        idempotencyKey: `quest:${questId}:user:${user.id}:event:pr-1`,
        userId: user.id,
        questId,
        title: "First merged PR",
        amount: 5,
        bucket: "tier",
    });
    await recordReward(db, {
        idempotencyKey: `quest:${questId}:user:${user.id}:event:pr-2`,
        userId: user.id,
        questId,
        title: "First merged PR",
        amount: 5,
        bucket: "tier",
    });
    if (!a.rewardId) throw new Error("Expected recorded reward id");
    await claimReward(db, { rewardId: a.rewardId, userId: user.id });

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
        quests: { id: string; stats: Record<string, number> }[];
    };

    expect(payload.quests.find((quest) => quest.id === questId)?.stats).toEqual(
        {
            earned: 2,
            claimed: 1,
            unclaimed: 1,
            pollenAwarded: 10,
            pollenClaimed: 5,
            pollenAwardedPercent: 100,
        },
    );
});

test("quest check records product rewards and claim endpoint credits one", async ({
    apiKey: _apiKey,
    mocks,
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await db.insert(schema.stripeCheckoutCredits).values([
        {
            sessionId: `cs_test_${user.id}_1`,
            eventId: `evt_${user.id}_1`,
            eventType: "checkout.session.completed",
            userId: user.id,
            pollenCredited: 60,
            createdAt: new Date(),
        },
        {
            sessionId: `cs_test_${user.id}_2`,
            eventId: `evt_${user.id}_2`,
            eventType: "checkout.session.completed",
            userId: user.id,
            pollenCredited: 41,
            createdAt: new Date(),
        },
    ]);

    const checkResponse = await SELF.fetch(
        "http://localhost:3000/api/account/quests/check",
        {
            method: "POST",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(checkResponse.status).toBe(200);
    const checkPayload = (await checkResponse.json()) as {
        success: boolean;
        checked: number;
        recorded: number;
    };
    // Behavior, not exact catalog: a check records at least one reward and is
    // idempotent (a second check records nothing new).
    expect(checkPayload.success).toBe(true);
    expect(checkPayload.recorded).toBeGreaterThan(0);

    const secondCheck = await checkQuestsForUser(env, user.id);
    expect(secondCheck.recorded).toBe(0);

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

    // History shape, not exact amounts: nothing claimed yet, no internal fields
    // leak, and the first-API-key reward is present so we can claim it below.
    expect(payload.totalClaimedPollen).toBeCloseTo(0);
    expect(payload.rewards.length).toBeGreaterThan(0);
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
    expect(claimPayload.reward.pollenAmount).toBe(0.25);

    const [claimedBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(claimedBalance?.tierBalance).toBeCloseTo(
        (user.tierBalance ?? 0) + 0.25,
    );
});

test("claim endpoint rejects coming_soon quest rewards", async ({
    mocks,
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    const reward = await recordReward(db, {
        idempotencyKey: `quest:github:public_repo_stars_20:user:${user.id}`,
        userId: user.id,
        questId: "github:public_repo_stars_20",
        title: "Earn over 20 GitHub stars",
        amount: 5,
        bucket: "tier",
    });
    if (!reward.rewardId) throw new Error("Expected recorded reward id");

    const response = await SELF.fetch(
        `http://localhost:3000/api/account/rewards/${reward.rewardId}/claim`,
        {
            method: "POST",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(response.status).toBe(409);

    const [storedReward] = await db
        .select({ claimedAt: schema.rewards.claimedAt })
        .from(schema.rewards)
        .where(eq(schema.rewards.id, reward.rewardId));
    expect(storedReward?.claimedAt).toBeNull();

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);
});

test("POST /quests/check throttles a user to once per minute", async ({
    apiKey: _apiKey,
    mocks,
    sessionToken,
}) => {
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    await env.KV.delete(`quest-check:throttle:${user.id}`);

    const first = await SELF.fetch(
        "http://localhost:3000/api/account/quests/check",
        {
            method: "POST",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(first.status).toBe(200);

    const second = await SELF.fetch(
        "http://localhost:3000/api/account/quests/check",
        {
            method: "POST",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBe("60");
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("rate_limited");

    // The throttled call must NOT have run the check (no side effects).
    const ledger = await checkQuestsForUser(env, user.id);
    // First call already recorded everything; the service-level idempotency
    // means this direct re-check records nothing new.
    expect(ledger.recorded).toBe(0);
});

test("D1 quest check only records the requested user", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    const first = await checkQuestsForUser(env, user.id);
    expect(first.recorded).toBeGreaterThan(0);

    const secondUserId = "api-key-window-user";
    await db.insert(schema.user).values({
        id: secondUserId,
        name: "API Key Window User",
        email: "api-key-window-user@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: null,
        githubUsername: null,
        tier: "spore",
        tierBalance: 0,
        packBalance: 0,
    });
    await db.insert(schema.apikey).values({
        id: "api-key-window-user-key",
        name: "Window User Key",
        key: "sk_api_key_window_user",
        prefix: "sk",
        userId: secondUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const second = await checkQuestsForUser(env, user.id);
    expect(second.recorded).toBe(0);

    const rows = await db
        .select({ userId: schema.rewards.userId })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "onboarding:first_api_key"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user.id);

    const third = await checkQuestsForUser(env, secondUserId);
    expect(third.recorded).toBe(1);

    const updatedRows = await db
        .select({ userId: schema.rewards.userId })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "onboarding:first_api_key"));
    expect(new Set(updatedRows.map((row) => row.userId))).toEqual(
        new Set([user.id, secondUserId]),
    );
});

test("six-month account quest is coming_soon and never records", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    // Account old enough to qualify on age — but the quest is coming_soon, so
    // the checker drops its proposal and nothing is recorded.
    const oldDate = new Date("2025-01-01T00:00:00Z");
    await db
        .update(schema.user)
        .set({ createdAt: oldDate, updatedAt: oldDate })
        .where(eq(schema.user.id, user.id));

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "community:six_month_account"));
    expect(rewards).toHaveLength(0);
});

test("quest check records app growth rewards for the app owner", async ({
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

    await checkQuestsForUser(env, user.id);

    const ownerRewards = await db
        .select({
            questId: schema.rewards.questId,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards);
    expect(ownerRewards).toEqual(
        expect.arrayContaining([
            {
                questId: "grow:first_byop_external_user",
                userId: user.id,
            },
            {
                questId: "grow:first_paid_spend_in_app",
                userId: user.id,
            },
        ]),
    );
    expect(
        ownerRewards.some(
            (reward) =>
                reward.questId === "setup:byop_login" &&
                reward.userId === user.id,
        ),
    ).toBe(false);
    expect(
        ownerRewards.some((reward) => reward.questId === "grow:app_listed"),
    ).toBe(false);

    // byop_login is coming_soon (inert), so logging in records nothing.
    await checkQuestsForUser(env, "byop-external-user");
    const externalRewards = await db
        .select({
            questId: schema.rewards.questId,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "setup:byop_login"));
    expect(externalRewards).toHaveLength(0);
});

test("quest check records model-usage rewards per modality", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    // This user has generated with text and audio, but not image.
    mocks.tinybird.state.modelModalitiesResponse = [
        {
            userId: user.id,
            usedText: 1,
            usedImage: 0,
            usedAudio: 1,
        },
    ];

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has("grow:use_text_model")).toBe(true);
    expect(questIds.has("grow:use_audio_model")).toBe(true);
    expect(questIds.has("grow:use_image_model")).toBe(false);

    expect(
        mocks.tinybird.state.pipeCalls.some(
            (call) =>
                call.url.includes("/v0/pipes/quest_model_modalities.json") &&
                call.query.user_id === user.id,
        ),
    ).toBe(true);
});

test("quest check ignores Tinybird rows for other users", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.modelModalitiesResponse = [
        {
            userId: "different-user",
            usedText: 1,
            usedImage: 0,
            usedAudio: 0,
        },
    ];

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "grow:use_text_model"));
    expect(rewards).toHaveLength(0);
});

test("quest check continues after one group fails", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    const failingGroup: QuestGroup = {
        id: "test-failing",
        async listQuestCards() {
            return [];
        },
        async findRewardProposalsForUser(): Promise<never> {
            throw new Error("planned quest failure");
        },
    };

    questIndex.QUEST_GROUPS.unshift(failingGroup);
    try {
        const result = await checkQuestsForUser(env, user.id);
        expect(result.success).toBe(false);
        expect(result.recorded).toBeGreaterThan(0);
        expect(result).not.toHaveProperty("results");
    } finally {
        questIndex.QUEST_GROUPS.shift();
    }
});

test("github established-account quest is coming_soon and never records", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    // Built but launch-gated (availability "coming_soon"): even an account well
    // over the one-year age threshold records no reward, because the
    // quest-checker drops coming_soon proposals.
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date(
        "2020-01-01T00:00:00Z",
    ).toISOString();
    await mocks.enable("github", "tinybird");

    await checkQuestsForUser(env, user.id);
    const establishedRows = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(
            eq(schema.rewards.questId, "onboarding:established_github_account"),
        );
    expect(establishedRows).toHaveLength(0);

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);
});

test("github public repo stars quest is coming_soon and never records", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    // The stars quest is built but launch-gated (availability "coming_soon"), so
    // the quest-checker drops its proposal — even a user well over the 20-star
    // threshold records no reward. Flip availability back to "available" in
    // github-profile.ts to re-enable granting.
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    mocks.github.state.repos = [
        { name: "core", size: 10, stargazers_count: 50 },
        { name: "docs", size: 5, stargazers_count: 50 },
    ];
    await mocks.enable("github", "tinybird");

    await checkQuestsForUser(env, user.id);
    const rewards = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "github:public_repo_stars_20"));
    expect(rewards).toHaveLength(0);
});

test("quest check records elixpo intern easter egg once", async ({
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

    const first = await checkQuestsForUser(env, user.id);
    expect(first.recorded).toBeGreaterThanOrEqual(1);

    const second = await checkQuestsForUser(env, user.id);
    expect(second.recorded).toBe(0);

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

test("quest check records completed GitHub quest issue rewards through shared path", async ({
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

    seedQuestIssue(mocks.github.state, {
        issueNumber,
        title: issueTitle,
        goal: "Merge the quest PR.",
        reward: 17,
        assigneeGithubId: user.githubId,
        assigneeLogin: user.githubUsername,
        completedByPrNumber: 888,
    });

    const first = await checkQuestsForUser(env, user.id);
    expect(first.recorded).toBeGreaterThanOrEqual(1);

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
    const mockedIssue = mocks.github.state.questIssues.find(
        (issue) => issue.number === issueNumber,
    );
    if (!mockedIssue) throw new Error("Expected mocked quest issue");
    mockedIssue.assignees = [{ login: "other-dev", databaseId: otherGithubId }];
    mockedIssue.updated_at = "2026-06-13T00:00:00Z";

    const second = await checkQuestsForUser(env, "github-quest-other-user");
    expect(second.recorded).toBe(0);

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
        title: `Ship bounty #${issueNumber}: ${issueTitle}`,
        pollenAmount: 17,
        balanceBucket: "tier",
    });
});

// Regression guard for the idempotency-key collapse: issue bounty quest ids MUST
// be derived from the issue number. Otherwise every scope:"once" bounty would
// share one key and only the first one ever records.
test("two lazy GitHub issue bounties each record independently", async ({
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
        {
            issueNumber: 901,
            assigneeGithubId: user.githubId,
            assigneeLogin: user.githubUsername,
            reward: 11,
        },
        {
            issueNumber: 902,
            assigneeGithubId: secondGithubId,
            assigneeLogin: "second-dev",
            reward: 13,
        },
    ];
    for (const issue of issues) {
        seedQuestIssue(mocks.github.state, {
            issueNumber: issue.issueNumber,
            title: `Community bounty #${issue.issueNumber}`,
            goal: "Merge the linked PR.",
            reward: issue.reward,
            assigneeGithubId: issue.assigneeGithubId,
            assigneeLogin: issue.assigneeLogin,
            completedByPrNumber: issue.issueNumber + 1000,
        });
    }

    await checkQuestsForUser(env, user.id);
    await checkQuestsForUser(env, "community-issue-second-user");

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
