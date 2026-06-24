import { env, SELF } from "cloudflare:test";
import { claimReward, recordReward } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { checkQuestsForUser } from "../src/services/quest-checker.ts";
import * as questIndex from "../src/services/quests/index.ts";
import type {
    QuestEvaluationContext,
    QuestGroup,
} from "../src/services/quests/types.ts";
import { test } from "./fixtures.ts";

const ELIXPO_INTERN_QUEST_ID = "easteregg:elixpo_intern";

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

test("GET /api/quests/catalog returns product quests and issue bounty cards", async () => {
    await env.KV.delete("quests:catalog:v13");
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
            balanceBucket: string;
            url: string | null;
            stats: {
                earned: number;
                claimed: number;
                unclaimed: number;
                pollenAwarded: number;
                pollenClaimed: number;
            };
        }[];
    };

    // Valid POLLEN-QUEST issues are dynamic quest cards. Malformed reward
    // bodies are ignored because a bounty without a reward amount cannot pay.
    expect(payload.quests).toHaveLength(staticCardCount + 2);
    // Every card carries a stats block; with no rewards recorded it's all zero.
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key")
            ?.stats,
    ).toEqual({
        earned: 0,
        claimed: 0,
        unclaimed: 0,
        pollenAwarded: 0,
        pollenClaimed: 0,
    });
    expect(
        payload.quests.find((quest) => quest.id === "onboarding:first_api_key"),
    ).toMatchObject({
        category: "setup",
        availability: "available",
        rewardAmount: 1,
        balanceBucket: "tier",
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "setup:byop_login"),
    ).toMatchObject({
        category: "setup",
        availability: "available",
        rewardAmount: 1,
        balanceBucket: "tier",
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "spend:first_top_up"),
    ).toMatchObject({
        category: "grow",
        availability: "available",
        rewardAmount: 5,
        balanceBucket: "tier",
        url: null,
    });
    expect(
        payload.quests.find(
            (quest) => quest.id === "spend:purchased_over_100_pollen",
        ),
    ).toMatchObject({
        category: "grow",
        availability: "available",
        rewardAmount: 50,
        balanceBucket: "tier",
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
        balanceBucket: "tier",
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
        balanceBucket: "tier",
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:first_merged_pr"),
    ).toMatchObject({
        category: "contribute",
        availability: "available",
        rewardAmount: 5,
        balanceBucket: "tier",
        url: null,
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:321"),
    ).toMatchObject({
        title: "Add a demo app",
        description: "Build a focused demo.",
        category: "contribute",
        availability: "available",
        rewardAmount: 15,
        balanceBucket: "tier",
        url: "https://github.com/pollinations/pollinations/issues/321",
    });
    expect(
        payload.quests.find((quest) => quest.id === "github:issue:322"),
    ).toMatchObject({
        title: "Fix a model config",
        description: "Wire the missing config.",
        category: "contribute",
        availability: "completed",
        rewardAmount: 20,
        balanceBucket: "tier",
        url: "https://github.com/pollinations/pollinations/issues/322",
    });
    expect(
        payload.quests.some((quest) => quest.id === "github:issue:323"),
    ).toBe(false);
    // The uniform card shape dropped the old board-state fields.
    for (const quest of payload.quests) {
        expect(quest).not.toHaveProperty("kind");
        expect(quest).not.toHaveProperty("iconId");
        expect(quest).not.toHaveProperty("assignees");
        expect(quest).not.toHaveProperty("sortKey");
    }
});

test("GET /api/quests/catalog returns product quests with no mirrored GitHub issues", async () => {
    await env.KV.delete("quests:catalog:v13");
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
        category: "contribute",
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

test("catalog stats aggregate earned/claimed from the rewards ledger", async ({
    sessionToken: _sessionToken,
}) => {
    await env.KV.delete("quests:catalog:v13");
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
    expect(checkPayload.success).toBe(true);
    expect(checkPayload.checked).toBe(4);
    expect(checkPayload.recorded).toBe(4);

    const secondCheck = await checkQuestsForUser(env, user.id);
    expect(secondCheck.checked).toBe(4);
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

    expect(payload.totalClaimedPollen).toBeCloseTo(0);
    expect(payload.totalClaimablePollen).toBeCloseTo(62);
    expect(payload.rewards).toHaveLength(4);
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
            (reward) => reward.questId === "spend:purchased_over_100_pollen",
        ),
    ).toMatchObject({
        pollenAmount: 50,
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

    await checkQuestsForUser(env, "byop-external-user");
    const externalRewards = await db
        .select({
            questId: schema.rewards.questId,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "setup:byop_login"));
    expect(externalRewards).toEqual([
        { questId: "setup:byop_login", userId: "byop-external-user" },
    ]);
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
        { userId: user.id, usedText: 1, usedImage: 0, usedAudio: 1 },
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

test("github account age quest waits until threshold", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
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

    await seedQuestIssue(db, {
        issueNumber,
        title: issueTitle,
        goal: "Merge the quest PR.",
        reward: 17,
        assigneeGithubId: user.githubId,
        assigneeLogin: user.githubUsername,
        completedByPrNumber: 888,
    });

    const first = await checkQuestsForUser(env, user.id);
    expect(first.recorded).toBeGreaterThanOrEqual(2);

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
