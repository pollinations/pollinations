import { env, SELF } from "cloudflare:test";
import { signSessionToken } from "@shared/auth/session-token.ts";
import {
    claimReward,
    recordRewards,
    rewardKey,
} from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect, vi } from "vitest";
import issueRewardMigration from "../drizzle/0058_rekey_issue_rewards.sql?raw";
import { checkQuestsForUser } from "../src/services/quest-checker.ts";
import type {
    QuestCategory,
    QuestDefinition,
} from "../src/services/quests/definitions.ts";
import * as agentUsage from "../src/services/quests/groups/agent-usage.ts";
import * as discordCommunity from "../src/services/quests/groups/discord-community.ts";
import * as questIndex from "../src/services/quests/index.ts";
import type { QuestGroup } from "../src/services/quests/types.ts";
import { registrableDomain } from "../src/services/setup-reward-holds.ts";
import { createApiKeyViaApi, test } from "./fixtures.ts";
import type { MockGithubState } from "./mocks/github.ts";

const ELIXPO_INTERN_QUEST_ID = "elixpo_intern";
const LEGACY_FIRST_TOP_UP_QUEST_ID = "first_top_up";
const LEGACY_TOP_UP_100_QUEST_ID = "top_up_100";
const TOP_UP_SINCE_LAUNCH_QUEST_ID = "top_up_since_launch";
const TOP_UP_100_SINCE_LAUNCH_QUEST_ID = "top_up_100_since_launch";
const QUEST_REWARDS_LAUNCH_CUTOFF_MILLIS = Date.parse(
    "2026-06-21T00:00:00.000Z",
);
const BEFORE_QUEST_REWARDS_LAUNCH_MILLIS =
    QUEST_REWARDS_LAUNCH_CUTOFF_MILLIS - 1;
const AFTER_QUEST_REWARDS_LAUNCH_DATE = new Date("2026-06-22T00:00:00.000Z");

test("omits the Discord quest when its configuration is incomplete", async () => {
    const ctx = {
        db: drizzle(env.DB, { schema }),
        env: {
            ...env,
            DISCORD_BOT_TOKEN: "",
        } as unknown as CloudflareBindings,
    };

    await expect(discordCommunity.listQuestCards(ctx)).resolves.toEqual([]);
    await expect(
        discordCommunity.evaluateUser(ctx, {
            id: "unused",
            githubId: null,
            githubUsername: null,
        }),
    ).resolves.toEqual({ proposals: [] });
});

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
    closed?: boolean;
    // When set, a merged PR closes the issue (→ "completed" / payable).
    completedByPrNumber?: number | null;
    completedByGithubId?: number | null;
    completedByLogin?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
};

// Seed a POLLEN-QUEST bounty into the GitHub mock exactly as the lazy GitHub
// reader sees it: issue fields plus the PRs that GitHub says closed it.
function seedQuestIssue(github: MockGithubState, issue: SeedQuestIssue): void {
    const assigneeGithubId = issue.assigneeGithubId ?? null;
    const assigneeLogin = issue.assigneeLogin ?? null;
    const completedBy = issue.completedByPrNumber ?? null;
    const completedByGithubId = issue.completedByGithubId ?? null;
    const completedByLogin = issue.completedByLogin ?? null;
    const created = issue.createdAt ?? new Date("2026-06-01T00:00:00Z");
    const updated = issue.updatedAt ?? new Date("2026-06-02T00:00:00Z");

    github.questIssues.push({
        number: issue.issueNumber,
        state: completedBy !== null || issue.closed ? "closed" : "open",
        title: issue.title,
        html_url: `https://github.com/pollinations/pollinations/issues/${issue.issueNumber}`,
        body: questIssueBody(issue.reward, issue.goal),
        created_at: created.toISOString(),
        updated_at: updated.toISOString(),
        closed_at:
            completedBy !== null || issue.closed ? updated.toISOString() : null,
        user: { login: "maintainer" },
        assignees: assigneeLogin
            ? [{ login: assigneeLogin, databaseId: assigneeGithubId }]
            : [],
        labels: [{ name: "POLLEN-QUEST" }],
        closedByPullRequestsReferences:
            completedBy !== null
                ? [
                      {
                          number: completedBy,
                          mergedAt: updated.toISOString(),
                          author: { databaseId: completedByGithubId },
                      },
                  ]
                : [],
    });

    if (completedBy !== null && completedByLogin) {
        github.mergedPullRequests.push({
            number: completedBy,
            authorLogin: completedByLogin,
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

test("issue reward migration embeds the legacy winner's GitHub id", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    if (user.githubId === null) throw new Error("Expected fixture GitHub id");

    const questId = "github:issue:legacy-migration";
    const legacyKey = `quest:${questId}`;
    await db.insert(schema.rewards).values({
        id: legacyKey,
        idempotencyKey: legacyKey,
        userId: user.id,
        questId,
        title: "Legacy issue reward",
        pollenAmount: 5,
        balanceBucket: "tier",
        earnedAt: new Date(),
    });

    await env.DB.prepare(issueRewardMigration).run();
    await env.DB.prepare(issueRewardMigration).run();

    const [reward] = await db
        .select({ idempotencyKey: schema.rewards.idempotencyKey })
        .from(schema.rewards)
        .where(eq(schema.rewards.id, legacyKey));
    expect(reward?.idempotencyKey).toBe(`${legacyKey}:github:${user.githubId}`);

    const unmappedKey = "quest:github:issue:unmapped";
    await db.insert(schema.rewards).values({
        id: unmappedKey,
        idempotencyKey: unmappedKey,
        userId: null,
        questId: "github:issue:unmapped",
        title: "Unmapped legacy issue reward",
        pollenAmount: 5,
        balanceBucket: "tier",
        earnedAt: new Date(),
    });
    await expect(env.DB.prepare(issueRewardMigration).run()).rejects.toThrow();
});

/** Distinct GitHub id per fixture account — github_id is unique. */
function hashGithubId(seed: string): number {
    let hash = 0;
    for (const char of seed)
        hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000;
    return 1_000_000 + hash;
}

async function seedByopConnections(
    ownerUserId: string,
    count: number,
    prefix: string,
): Promise<string[]> {
    const db = drizzle(env.DB, { schema });
    const now = new Date();
    const userIds = Array.from(
        { length: count },
        (_, index) => `${prefix}-user-${index}`,
    );
    const appKeyId = `${prefix}-app-key`;

    await db.insert(schema.user).values(
        userIds.map((id, index) => ({
            id,
            name: id,
            email: `${id}@example.com`,
            githubId: hashGithubId(`${prefix}-${index}`),
            createdAt: now,
            updatedAt: now,
        })),
    );
    await db.insert(schema.apikey).values({
        id: appKeyId,
        key: `pk_${prefix}`,
        referenceId: ownerUserId,
        createdAt: now,
        updatedAt: now,
    });
    const userKeys = userIds.map((userId, index) => ({
        id: `${prefix}-user-key-${index}`,
        key: `sk_${prefix}_${index}`,
        referenceId: userId,
        byopClientKeyId: appKeyId,
        createdAt: now,
        updatedAt: now,
    }));
    for (let offset = 0; offset < userKeys.length; offset += 5) {
        await db
            .insert(schema.apikey)
            .values(userKeys.slice(offset, offset + 5));
    }
    return userIds;
}

async function createUsageApiKey(accountToken: string, name: string) {
    const created = await createApiKeyViaApi(accountToken, {
        name,
        accountPermissions: ["usage"],
    });
    return created.key;
}

test("recordRewards dedups on idempotency key and claimReward credits once", async ({
    sessionToken: _sessionToken,
}) => {
    // recordRewards is the generic idempotent write: it records a key once and
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

    const first = await recordRewards(db, [
        {
            idempotencyKey: firstEventKey,
            userId: user.id,
            questId,
            title,
            amount: rewardAmount,
            bucket,
        },
    ]);
    const duplicate = await recordRewards(db, [
        {
            idempotencyKey: firstEventKey,
            userId: user.id,
            questId,
            title,
            amount: rewardAmount,
            bucket,
        },
    ]);
    const secondEvent = await recordRewards(db, [
        {
            idempotencyKey: secondEventKey,
            userId: user.id,
            questId,
            title,
            amount: rewardAmount,
            bucket,
        },
    ]);

    expect(first.recorded).toBe(1);
    expect(duplicate.recorded).toBe(0);
    expect(secondEvent.recorded).toBe(1);

    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);

    const firstRewardId = first.rewardIds[0];
    if (!firstRewardId) throw new Error("Expected recorded reward id");
    const claimed = await claimReward(db, {
        rewardId: firstRewardId,
        userId: user.id,
    });
    const duplicateClaim = await claimReward(db, {
        rewardId: firstRewardId,
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

test("catalog returns quest definitions without ledger stats", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github");
    await env.KV.delete("quests:catalog:v30");

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
        quests: {
            id: string;
            title: string;
            description: string;
            rewardAmount: number;
            balanceBucket: string;
            state: string;
            goal?: { target: number; unit: string };
            availability?: unknown;
            stats?: unknown;
        }[];
    };
    const byId = new Map(payload.quests.map((quest) => [quest.id, quest]));
    const expectStableCatalogFields = (
        id: string,
        expected: {
            state: string;
            rewardAmount: number;
            balanceBucket: string;
        },
    ) => {
        const quest = byId.get(id);

        expect(quest).toMatchObject(expected);
        expect(typeof quest?.title).toBe("string");
        expect(typeof quest?.description).toBe("string");
    };
    const catalogQuest = byId.get("merged_pr");

    expect(catalogQuest?.state).toBe("available");
    expect(catalogQuest).not.toHaveProperty("availability");
    expect(catalogQuest).not.toHaveProperty("stats");
    expectStableCatalogFields(LEGACY_FIRST_TOP_UP_QUEST_ID, {
        state: "completed",
        rewardAmount: 10,
        balanceBucket: "tier",
    });
    expectStableCatalogFields(LEGACY_TOP_UP_100_QUEST_ID, {
        state: "completed",
        rewardAmount: 50,
        balanceBucket: "tier",
    });
    expectStableCatalogFields(TOP_UP_SINCE_LAUNCH_QUEST_ID, {
        state: "available",
        rewardAmount: 5,
        balanceBucket: "tier",
    });
    expectStableCatalogFields(TOP_UP_100_SINCE_LAUNCH_QUEST_ID, {
        state: "available",
        rewardAmount: 50,
        balanceBucket: "tier",
    });
    expect(byId.get(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)?.goal).toEqual({
        target: 100,
        unit: "pollen",
    });
    expectStableCatalogFields("app_listed", {
        state: "available",
        rewardAmount: 10,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("use_app", {
        state: "available",
        rewardAmount: 0.25,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("connect_polli_cli", {
        state: "available",
        rewardAmount: 1,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("join_discord", {
        state: "available",
        rewardAmount: 1,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("discord_boost", {
        state: "available",
        rewardAmount: 20,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("discord_level_10", {
        state: "available",
        rewardAmount: 2,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("discord_level_20", {
        state: "available",
        rewardAmount: 5,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("app_active", {
        state: "completed",
        rewardAmount: 7,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("early_adopter", {
        state: "coming_soon",
        rewardAmount: 2,
        balanceBucket: "tier",
    });
    expect(byId.get("early_adopter")?.title).toBe("Early adopter");
    expectStableCatalogFields("github_established", {
        state: "completed",
        rewardAmount: 1,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("app_paid_request", {
        state: "completed",
        rewardAmount: 15,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("app_users_10", {
        state: "completed",
        rewardAmount: 3,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("create_used_agent", {
        state: "completed",
        rewardAmount: 2,
        balanceBucket: "tier",
    });
    expectStableCatalogFields("app_pollen_10", {
        state: "available",
        rewardAmount: 10,
        balanceBucket: "tier",
    });
    expect(byId.get("app_pollen_10")?.goal).toEqual({
        target: 3,
        unit: "pollen",
    });
});

test("catalog includes coming-soon GitHub issue placeholder", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github");
    await env.KV.delete("quests:catalog:v30");

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
            state: string;
            rewardAmount: number;
            balanceBucket: string;
            url: string | null;
        }[];
    };
    const placeholder = payload.quests.find(
        (quest) => quest.id === "solve_github_issue",
    );

    expect(placeholder).toMatchObject({
        title: "Solve a quest issue in GitHub",
        category: "contribute",
        state: "coming_soon",
        rewardAmount: 0,
        balanceBucket: "tier",
        url: null,
    });
    expect(placeholder?.description).toEqual(expect.any(String));
    expect(
        payload.quests.find((quest) => quest.id === "reported_merged_issue"),
    ).toMatchObject({
        category: "contribute",
        state: "available",
        rewardAmount: 3,
        balanceBucket: "tier",
        url: "https://github.com/pollinations/pollinations/issues/new/choose",
    });
});

test("catalog hides assigned and closed GitHub quest issues", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github");
    await env.KV.delete("quests:catalog:v30");

    seedQuestIssue(mocks.github.state, {
        issueNumber: 801,
        title: "Open bounty",
        goal: "Still available.",
        reward: 3,
        assigneeGithubId: 123456,
        assigneeLogin: "interested-contributor",
    });
    seedQuestIssue(mocks.github.state, {
        issueNumber: 802,
        title: "Closed without merge",
        goal: "Closed by maintainers without a merged quest PR.",
        reward: 4,
        closed: true,
    });
    seedQuestIssue(mocks.github.state, {
        issueNumber: 803,
        title: "Merged bounty",
        goal: "Closed by a merged quest PR.",
        reward: 5,
        completedByPrNumber: 1803,
    });
    seedQuestIssue(mocks.github.state, {
        issueNumber: 804,
        title: "Unassigned bounty",
        goal: "Still available.",
        reward: 6,
    });

    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
        quests: {
            id: string;
            state: string;
        }[];
    };
    const byId = new Map(payload.quests.map((quest) => [quest.id, quest]));

    expect(byId.get("github:issue:801")?.state).toBe("completed");
    expect(byId.has("github:issue:802")).toBe(false);
    expect(byId.get("github:issue:803")?.state).toBe("completed");
    expect(byId.get("github:issue:804")?.state).toBe("available");
});

test("catalog keeps the last GitHub quest issues while GitHub is rate limited", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github");
    seedQuestIssue(mocks.github.state, {
        issueNumber: 805,
        title: "Listed bounty",
        goal: "Still available.",
        reward: 6,
    });
    const catalogIds = async () => {
        await env.KV.delete("quests:catalog:v30");
        const response = await SELF.fetch(
            "http://localhost:3000/api/quests/catalog",
        );
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { quests: { id: string }[] };
        return payload.quests.map((quest) => quest.id);
    };
    expect(await catalogIds()).toContain("github:issue:805");

    mocks.github.state.failQuestSearch = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    try {
        expect(await catalogIds()).toContain("github:issue:805");
    } finally {
        vi.useRealTimers();
    }
});

test("quest checks reuse the GitHub quest issues the catalog just fetched", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");
    seedQuestIssue(mocks.github.state, {
        issueNumber: 806,
        title: "Merged bounty",
        goal: "Merge the quest PR.",
        reward: 7,
        completedByPrNumber: 1806,
        completedByGithubId: user.githubId,
        completedByLogin: user.githubUsername,
    });
    await env.KV.delete("quests:catalog:v30");
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);

    // A check within the cache window must not search GitHub again.
    mocks.github.state.questIssues = [];
    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ idempotencyKey: schema.rewards.idempotencyKey })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "github:issue:806"));
    expect(rewards).toEqual([
        { idempotencyKey: `quest:github:issue:806:github:${user.githubId}` },
    ]);
});

test("account quests merge earned rewards into completed status", async ({
    mocks,
    accountToken,
}) => {
    const db = drizzle(env.DB, { schema });
    await mocks.enable("github", "tinybird");
    await env.KV.delete("quests:catalog:v30");
    const user = await getOnlyUser();

    const createKeyResponse = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            },
            body: JSON.stringify({
                name: "quest-status-key",
                accountPermissions: ["usage"],
            }),
        },
    );
    expect(createKeyResponse.status).toBe(200);
    const createdKey = (await createKeyResponse.json()) as { key: string };

    const recorded = await recordRewards(db, [
        {
            idempotencyKey: `quest:test-earned:${user.id}`,
            userId: user.id,
            questId: "use_app",
            title: "Use a Pollinations app",
            amount: 0.25,
            bucket: "tier",
        },
    ]);
    expect(recorded.recorded).toBe(1);

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests",
        {
            headers: {
                authorization: `Bearer ${createdKey.key}`,
            },
        },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
        quests: {
            id: string;
            state: string;
            status: string;
            reward: { id: string; claimedAt: string | null } | null;
        }[];
    };
    const byId = new Map(payload.quests.map((quest) => [quest.id, quest]));

    expect(byId.get("use_app")).toMatchObject({
        state: "available",
        status: "completed",
        reward: {
            id: recorded.rewardIds[0],
            claimedAt: null,
        },
    });
    expect(byId.get(LEGACY_FIRST_TOP_UP_QUEST_ID)).toMatchObject({
        state: "completed",
        status: "completed",
        reward: null,
    });

    const usageKey = await createUsageApiKey(accountToken, "quest-usage-key");
    const usageResponse = await SELF.fetch(
        "http://localhost:3000/api/account/quests",
        {
            headers: {
                authorization: `Bearer ${usageKey}`,
            },
        },
    );
    expect(usageResponse.status).toBe(200);
    const usagePayload = (await usageResponse.json()) as typeof payload;
    const usageById = new Map(
        usagePayload.quests.map((quest) => [quest.id, quest]),
    );
    expect(usageById.get("use_app")).toMatchObject({
        status: "completed",
        reward: {
            id: recorded.rewardIds[0],
        },
    });
});

test("quest check records product rewards and claim endpoint credits one", async ({
    apiKey: _apiKey,
    mocks,
    accountToken,
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
                Authorization: `Bearer ${accountToken}`,
            },
        },
    );
    expect(checkResponse.status).toBe(200);
    const checkPayload = (await checkResponse.json()) as {
        success: boolean;
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
    // The fixture key already earned and auto-claimed the first-key reward;
    // the top-up reward waits for a manual claim.
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests/rewards",
        {
            headers: {
                Authorization: `Bearer ${accountToken}`,
            },
        },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
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

    // History shape, not exact catalog: no internal fields leak, the API-key
    // reward auto-claims, and another earned reward remains manually claimable.
    expect(payload.rewards.length).toBeGreaterThan(0);
    for (const reward of payload.rewards) {
        expect(reward).not.toHaveProperty("idempotencyKey");
        expect(reward).not.toHaveProperty("source");
        expect(reward).not.toHaveProperty("sourceRef");
        expect(reward).not.toHaveProperty("metadata");
        expect(reward).not.toHaveProperty("metadataJson");
        expect(typeof reward.earnedAt).toBe("string");
    }
    const firstApiKeyReward = payload.rewards.find(
        (reward) => reward.questId === "first_api_key",
    );
    if (!firstApiKeyReward) throw new Error("Expected first API key reward");
    expect(firstApiKeyReward.claimedAt).not.toBeNull();

    const topUpReward = payload.rewards.find(
        (reward) => reward.questId === TOP_UP_SINCE_LAUNCH_QUEST_ID,
    );

    if (!topUpReward) throw new Error("Expected top-up reward");
    expect(topUpReward.claimedAt).toBeNull();
    const claimResponse = await SELF.fetch(
        `http://localhost:3000/api/account/quests/rewards/${topUpReward.id}/claim`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accountToken}`,
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
    expect(claimPayload.reward.pollenAmount).toBe(5);

    const [claimedBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(claimedBalance?.tierBalance).toBeCloseTo(
        (user.tierBalance ?? 0) + 5,
    );
});

test("top-up 100 quest records for exactly 100 paid checkout pollen", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: `cs_test_${user.id}_exact_100`,
        eventId: `evt_${user.id}_exact_100`,
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 100,
        createdAt: AFTER_QUEST_REWARDS_LAUNCH_DATE,
    });

    const result = await checkQuestsForUser(env, user.id);

    expect(result.progress).toContainEqual({
        questId: TOP_UP_100_SINCE_LAUNCH_QUEST_ID,
        current: 100,
        target: 100,
        unit: "pollen",
    });

    const rewards = await db
        .select({
            questId: schema.rewards.questId,
            idempotencyKey: schema.rewards.idempotencyKey,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has(TOP_UP_SINCE_LAUNCH_QUEST_ID)).toBe(true);
    expect(questIds.has(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)).toBe(true);
    expect(questIds.has(LEGACY_FIRST_TOP_UP_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_TOP_UP_100_QUEST_ID)).toBe(false);
    expect(
        rewards.find(
            (reward) => reward.questId === TOP_UP_100_SINCE_LAUNCH_QUEST_ID,
        ),
    ).toMatchObject({
        idempotencyKey: `quest:${TOP_UP_100_SINCE_LAUNCH_QUEST_ID}:github:${user.githubId}`,
    });
});

test("top-up quests ignore paid checkout pollen before quest launch", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await env.DB.prepare(
        `INSERT INTO stripe_checkout_credits (
            session_id,
            event_id,
            event_type,
            user_id,
            pollen_credited,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            `cs_test_${user.id}_old_100`,
            `evt_${user.id}_old_100`,
            "checkout.session.completed",
            user.id,
            100,
            BEFORE_QUEST_REWARDS_LAUNCH_MILLIS,
        )
        .run();

    const result = await checkQuestsForUser(env, user.id);

    expect(result.progress).toContainEqual({
        questId: TOP_UP_100_SINCE_LAUNCH_QUEST_ID,
        current: 0,
        target: 100,
        unit: "pollen",
    });

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has(TOP_UP_SINCE_LAUNCH_QUEST_ID)).toBe(false);
    expect(questIds.has(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_FIRST_TOP_UP_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_TOP_UP_100_QUEST_ID)).toBe(false);
});

test("top-up quests ignore Polar checkout pollen", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await db.insert(schema.polarCheckoutCredits).values({
        orderId: `polar_order_${user.id}_first_top_up`,
        eventId: `polar:${user.id}:first_top_up`,
        eventType: "polar.order.paid",
        userId: user.id,
        pollenCredited: 40,
        polarCreatedAt: AFTER_QUEST_REWARDS_LAUNCH_DATE.getTime(),
        amount: 2000,
        totalAmount: 2400,
        currency: "usd",
        customerId: `polar_customer_${user.id}`,
        productId: "polar_product_20x2",
        productName: "20 pollen + 20 FREE",
        productSlug: "v1:product:pack:20x2",
        metadataJson: JSON.stringify({ source: "test" }),
        createdAt: AFTER_QUEST_REWARDS_LAUNCH_DATE,
    });

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has(TOP_UP_SINCE_LAUNCH_QUEST_ID)).toBe(false);
    expect(questIds.has(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_FIRST_TOP_UP_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_TOP_UP_100_QUEST_ID)).toBe(false);
});

test("top-up 100 quest only sums checkout pollen since quest launch", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await env.DB.prepare(
        `INSERT INTO stripe_checkout_credits (
            session_id,
            event_id,
            event_type,
            user_id,
            pollen_credited,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            `cs_test_${user.id}_old_80`,
            `evt_${user.id}_old_80`,
            "checkout.session.completed",
            user.id,
            80,
            BEFORE_QUEST_REWARDS_LAUNCH_MILLIS,
        )
        .run();
    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: `cs_test_${user.id}_recent_40`,
        eventId: `evt_${user.id}_recent_40`,
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 40,
        createdAt: AFTER_QUEST_REWARDS_LAUNCH_DATE,
    });

    const result = await checkQuestsForUser(env, user.id);

    expect(result.progress).toContainEqual({
        questId: TOP_UP_100_SINCE_LAUNCH_QUEST_ID,
        current: 40,
        target: 100,
        unit: "pollen",
    });

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has(TOP_UP_SINCE_LAUNCH_QUEST_ID)).toBe(true);
    expect(questIds.has(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_FIRST_TOP_UP_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_TOP_UP_100_QUEST_ID)).toBe(false);
});

test("top-up 100 quest sums multiple Stripe checkout rows", async ({
    apiKey: _apiKey,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: `cs_test_${user.id}_partial_60`,
        eventId: `evt_${user.id}_partial_60`,
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 60,
        createdAt: AFTER_QUEST_REWARDS_LAUNCH_DATE,
    });
    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: `cs_test_${user.id}_partial_40`,
        eventId: `evt_${user.id}_partial_40`,
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 40,
        createdAt: AFTER_QUEST_REWARDS_LAUNCH_DATE,
    });

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has(TOP_UP_SINCE_LAUNCH_QUEST_ID)).toBe(true);
    expect(questIds.has(TOP_UP_100_SINCE_LAUNCH_QUEST_ID)).toBe(true);
    expect(questIds.has(LEGACY_FIRST_TOP_UP_QUEST_ID)).toBe(false);
    expect(questIds.has(LEGACY_TOP_UP_100_QUEST_ID)).toBe(false);
});

test("POST /account/quests/check throttles a user to once per minute", async ({
    apiKey: _apiKey,
    mocks,
    accountToken,
}) => {
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    await env.KV.delete(`quest-check:throttle:${user.id}`);

    const first = await SELF.fetch(
        "http://localhost:3000/api/account/quests/check",
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accountToken}` },
        },
    );
    expect(first.status).toBe(200);

    const second = await SELF.fetch(
        "http://localhost:3000/api/account/quests/check",
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accountToken}` },
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
    // Creating the fixture key already recorded this user's first-key reward.

    const secondUserId = "api-key-window-user";
    await db.insert(schema.user).values({
        id: secondUserId,
        name: "API Key Window User",
        email: "api-key-window-user@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: hashGithubId("api-key-window-user"),
        githubUsername: "api-key-window-user",
        tierBalance: 0,
        packBalance: 0,
    });
    await db.insert(schema.apikey).values({
        id: "api-key-window-user-key",
        name: "Window User Key",
        key: "sk_api_key_window_user",
        prefix: "sk",
        referenceId: secondUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const second = await checkQuestsForUser(env, user.id);
    expect(second.recorded).toBe(0);

    const rows = await db
        .select({ userId: schema.rewards.userId })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "first_api_key"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user.id);

    const third = await checkQuestsForUser(env, secondUserId);
    expect(third.recorded).toBe(1);

    const updatedRows = await db
        .select({ userId: schema.rewards.userId })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "first_api_key"));
    expect(new Set(updatedRows.map((row) => row.userId))).toEqual(
        new Set([user.id, secondUserId]),
    );
});

test("a Google user earns basic quests once, before and after connecting GitHub", async ({
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    await mocks.enable("github", "tinybird");
    const userId = "google-quest-user";
    await db.insert(schema.user).values({
        id: userId,
        name: "Google Quest User",
        email: "google-quest-user@example.com",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tierBalance: 0,
        packBalance: 0,
    });
    await db.insert(schema.account).values({
        id: "google-quest-user-account",
        accountId: "google-sub-1",
        providerId: "google",
        userId,
    });
    await db.insert(schema.apikey).values({
        id: "google-quest-user-key",
        name: "Google Quest User Key",
        key: "sk_google_quest_user",
        prefix: "sk",
        referenceId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const firstKeyRewards = () =>
        db
            .select({ idempotencyKey: schema.rewards.idempotencyKey })
            .from(schema.rewards)
            .where(eq(schema.rewards.questId, "first_api_key"));

    await checkQuestsForUser(env, userId);
    expect(await firstKeyRewards()).toEqual([
        { idempotencyKey: "quest:first_api_key:google:google-sub-1" },
    ]);

    // Connecting GitHub changes the reward identity, not what was earned.
    await db
        .update(schema.user)
        .set({
            githubId: hashGithubId("google-quest-user"),
            githubUsername: "google-quest-user",
        })
        .where(eq(schema.user.id, userId));
    await checkQuestsForUser(env, userId);
    expect(await firstKeyRewards()).toHaveLength(1);
});

test("nine-month Early Adopter quest is coming_soon and never records", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    const oldDate = new Date("2025-01-01T00:00:00Z");
    await db
        .update(schema.user)
        .set({ createdAt: oldDate, updatedAt: oldDate })
        .where(eq(schema.user.id, user.id));

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "early_adopter"));
    expect(rewards).toHaveLength(0);
});

test("app growth quests reward paid usage and ten-user reach, not the first connection", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.appUsageResponse = [
        {
            userId: user.id,
            pollenUsed: 11,
            paidPollenUsed: 3.01,
            paidRequests: 1,
        },
    ];
    mocks.tinybird.state.appDirectoryResponse = [
        { github_user_id: String(user.githubId) },
    ];

    const [externalUserId] = await seedByopConnections(user.id, 11, "byop");
    if (!externalUserId) throw new Error("Expected an external BYOP user");

    mocks.tinybird.state.pipeCalls = [];
    await checkQuestsForUser(env, user.id);

    const ownerRewards = await db
        .select({
            questId: schema.rewards.questId,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards);
    const ownerQuestIds = new Set(
        ownerRewards
            .filter(
                (reward) =>
                    reward.userId === user.id &&
                    reward.questId?.startsWith("app_"),
            )
            .map((reward) => reward.questId),
    );
    expect(ownerQuestIds).toEqual(new Set(["app_pollen_10", "app_listed"]));
    // use_app is live, but the owner has no BYOP-attributed key of their own.
    expect(
        ownerRewards.some(
            (reward) =>
                reward.questId === "use_app" && reward.userId === user.id,
        ),
    ).toBe(false);
    expect(
        mocks.tinybird.state.pipeCalls.some((call) =>
            call.url.includes("/v0/pipes/quest_app_usage.json"),
        ),
    ).toBe(true);
    expect(
        mocks.tinybird.state.pipeCalls.some((call) =>
            call.url.includes("/v0/pipes/app_directory_public.json"),
        ),
    ).toBe(true);

    // use_app is live: the external user's BYOP-attributed key earns it.
    mocks.tinybird.state.pipeCalls = [];
    await checkQuestsForUser(env, externalUserId);
    const externalRewards = await db
        .select({
            questId: schema.rewards.questId,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "use_app"));
    expect(externalRewards).toEqual([
        { questId: "use_app", userId: externalUserId },
    ]);
});

test("Polli CLI quest rewards device-login keys on accounts 3+ days old", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const owner = await getOnlyUser();
    const [polliUserId, otherUserId, freshPolliUserId] =
        await seedByopConnections(owner.id, 3, "polli-quest");
    if (!polliUserId || !otherUserId || !freshPolliUserId) {
        throw new Error("Expected BYOP users");
    }

    await db
        .update(schema.apikey)
        .set({ byopClientKeyId: "jF3QOFUCn0ipcgRqkTU2kiSFMwZtm7v0" })
        .where(
            inArray(schema.apikey.referenceId, [polliUserId, freshPolliUserId]),
        );
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await db
        .update(schema.user)
        .set({ createdAt: fourDaysAgo })
        .where(inArray(schema.user.id, [polliUserId, otherUserId]));

    for (const userId of [
        polliUserId,
        otherUserId,
        freshPolliUserId,
        polliUserId,
    ]) {
        await checkQuestsForUser(env, userId, [
            questIndex.ACCOUNT_SETUP_QUEST_GROUP,
        ]);
    }

    const rewards = await db
        .select({
            userId: schema.rewards.userId,
            amount: schema.rewards.pollenAmount,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "connect_polli_cli"));
    expect(rewards).toEqual([{ userId: polliUserId, amount: 1 }]);
});

test("app milestones award their rewards at inclusive thresholds", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.appUsageResponse = [
        {
            userId: user.id,
            pollenUsed: 10,
            paidPollenUsed: 3,
            paidRequests: 1,
        },
    ];

    await seedByopConnections(user.id, 10, "milestone");

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({
            questId: schema.rewards.questId,
            pollenAmount: schema.rewards.pollenAmount,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has("app_pollen_10")).toBe(true);
    // Retired milestones never record, even when their old threshold is met.
    expect(questIds.has("app_users_10")).toBe(false);
    expect(questIds.has("app_paid_request")).toBe(false);
    expect(questIds.has("app_active")).toBe(false);
    expect(rewards).toEqual(
        expect.arrayContaining([
            { questId: "app_pollen_10", pollenAmount: 10 },
        ]),
    );
});

test("app milestones do not record below their thresholds, even with Quest Pollen usage", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.appUsageResponse = [
        {
            userId: user.id,
            pollenUsed: 100,
            paidPollenUsed: 2.99,
            paidRequests: 100,
        },
    ];

    await seedByopConnections(user.id, 9, "below-milestone");
    const result = await checkQuestsForUser(env, user.id);

    expect(result.progress).toContainEqual({
        questId: "app_pollen_10",
        current: 2.99,
        target: 3,
        unit: "pollen",
    });

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has("app_paid_request")).toBe(false);
    expect(questIds.has("app_users_10")).toBe(false);
    expect(questIds.has("app_pollen_10")).toBe(false);
});

test("app spending quests do not use gross Pollen when Paid usage is missing", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    mocks.tinybird.state.appUsageResponse = [
        { userId: user.id, pollenUsed: 100, paidRequests: 1 },
    ];

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select()
        .from(schema.rewards)
        .where(
            inArray(schema.rewards.questId, [
                "app_pollen_10",
                "app_paid_request",
            ]),
        );
    expect(rewards).toHaveLength(0);
});

test("existing app rewards retain their original amounts and remain claimable once", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("tinybird");
    const originalRewards = [
        { questId: "app_active", amount: 7 },
        { questId: "app_users_10", amount: 15 },
        { questId: "app_pollen_10", amount: 3 },
        { questId: "app_paid_request", amount: 15 },
    ];
    mocks.tinybird.state.appUsageResponse = [
        { userId: user.id, pollenUsed: 3, paidPollenUsed: 3, paidRequests: 0 },
    ];
    await recordRewards(
        db,
        originalRewards.map(({ questId, amount }) => ({
            idempotencyKey: rewardKey(questId, user),
            userId: user.id,
            questId,
            title: questId,
            amount,
            bucket: "tier",
        })),
    );
    await seedByopConnections(user.id, 10, "existing-app-rewards");

    const result = await checkQuestsForUser(
        env,
        user.id,
        questIndex.QUEST_GROUPS.filter((group) => group.id === "app-growth"),
    );
    expect(result.success).toBe(true);
    expect(result.recorded).toBe(0);

    const rewards = await db
        .select()
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    expect(rewards).toHaveLength(4);
    for (const reward of rewards) {
        const claim = { rewardId: reward.id, userId: user.id };
        const claimed = await claimReward(db, claim);
        expect(claimed.claimed).toBe(true);
        expect(claimed.reward?.pollenAmount).toBe(
            originalRewards.find(
                (original) => original.questId === reward.questId,
            )?.amount,
        );
        expect((await claimReward(db, claim)).claimed).toBe(false);
    }
    const [balance] = await db
        .select({ value: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.value).toBeCloseTo((user.tierBalance ?? 0) + 40);
});

test("quest check records model-usage rewards per modality", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");
    // This user has generated with text, audio and video, but not image.
    mocks.tinybird.state.modelModalitiesResponse = [
        {
            userId: user.id,
            usedText: 1,
            usedImage: 0,
            usedAudio: 1,
            usedVideo: 1,
        },
    ];

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const questIds = new Set(rewards.map((reward) => reward.questId));
    expect(questIds.has("use_text_model")).toBe(true);
    expect(questIds.has("use_audio_model")).toBe(true);
    expect(questIds.has("use_video_model")).toBe(true);
    expect(questIds.has("use_image_model")).toBe(false);

    expect(
        mocks.tinybird.state.pipeCalls.some(
            (call) =>
                call.url.includes("/v0/pipes/quest_model_modalities.json") &&
                call.query.user_id === user.id,
        ),
    ).toBe(true);
});

const AGENT_QUEST_REWARDS: Record<string, number> = {
    use_agent: 0.25,
    use_community_model: 0.25,
    create_used_community_model: 2,
};
const NO_AGENT_FLAGS = {
    usedAgent: 0,
    usedCommunityModel: 0,
    createdUsedCommunityModel: 0,
};
const ALL_AGENT_FLAGS = {
    usedAgent: 1,
    usedCommunityModel: 1,
    createdUsedCommunityModel: 1,
};

for (const { flags, expected } of [
    { flags: {}, expected: [] },
    { flags: { usedAgent: 1 }, expected: ["use_agent"] },
    { flags: { usedCommunityModel: 1 }, expected: ["use_community_model"] },
    {
        flags: { createdUsedCommunityModel: 1 },
        expected: ["create_used_community_model"],
    },
    {
        flags: ALL_AGENT_FLAGS,
        expected: [
            "create_used_community_model",
            "use_agent",
            "use_community_model",
        ],
    },
]) {
    test(`agent quests award each milestone once: ${expected.join("+") || "none"}`, async ({
        mocks,
        sessionToken: _sessionToken,
    }) => {
        const user = await getOnlyUser();
        const db = drizzle(env.DB, { schema });
        await mocks.enable("tinybird");
        mocks.tinybird.state.agentUsageResponse = [
            { userId: "another-user", ...ALL_AGENT_FLAGS },
            { userId: user.id, ...NO_AGENT_FLAGS, ...flags },
        ];
        const groups = [{ id: "agent-usage", ...agentUsage }];
        const result = await checkQuestsForUser(env, user.id, groups);
        expect(result.success).toBe(true);
        expect(result.recorded).toBe(expected.length);
        expect((await checkQuestsForUser(env, user.id, groups)).recorded).toBe(
            0,
        );

        const rewards = await db
            .select()
            .from(schema.rewards)
            .where(eq(schema.rewards.userId, user.id));
        expect(rewards.map((r) => r.questId).sort()).toEqual(expected);
        for (const reward of rewards) {
            expect(reward.pollenAmount).toBe(
                AGENT_QUEST_REWARDS[reward.questId],
            );
            expect(reward.balanceBucket).toBe("tier");
            expect(reward.claimedAt).toBeNull();
        }
        expect(mocks.tinybird.state.pipeCalls).toContainEqual({
            url: expect.stringContaining("/v0/pipes/quest_agent_usage.json"),
            query: {
                user_id: user.id,
                github_username: user.githubUsername ?? "",
            },
        });
        for (const reward of rewards) {
            const claim = { rewardId: reward.id, userId: user.id };
            expect((await claimReward(db, claim)).claimed).toBe(true);
            expect((await claimReward(db, claim)).claimed).toBe(false);
        }
        expect((await getOnlyUser()).tierBalance).toBeCloseTo(
            (user.tierBalance ?? 0) +
                rewards.reduce((sum, reward) => sum + reward.pollenAmount, 0),
        );
        expect((await checkQuestsForUser(env, user.id, groups)).recorded).toBe(
            0,
        );
    });
}

test("agent quests ignore another user's milestone rows", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const user = await getOnlyUser();
    await mocks.enable("tinybird");
    mocks.tinybird.state.agentUsageResponse = [
        { userId: "another-user", ...ALL_AGENT_FLAGS },
    ];
    const result = await checkQuestsForUser(env, user.id, [
        { id: "agent-usage", ...agentUsage },
    ]);
    expect(result.success).toBe(true);
    expect(result.recorded).toBe(0);
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
        .where(eq(schema.rewards.questId, "use_text_model"));
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
        async evaluateUser(): Promise<never> {
            throw new Error("planned quest failure");
        },
    };

    // Creating the fixture key already earned the first-key reward; clear it so
    // the remaining groups have a reward to record.
    await drizzle(env.DB, { schema })
        .delete(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));

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

test("retired Senior dev quest neither records nor fetches the GitHub profile", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date(
        "2020-01-01T00:00:00Z",
    ).toISOString();
    await mocks.enable("github", "tinybird");

    mocks.github.state.requests = [];
    await checkQuestsForUser(env, user.id);

    const establishedRows = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "github_established"));
    expect(establishedRows).toHaveLength(0);
    expect(
        mocks.github.state.requests.some(
            (request) => request.path === `/user/${user.githubId}`,
        ),
    ).toBe(false);
});

test("a GitHub identity cannot be attached to a second account", async ({
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();

    await expect(
        db.insert(schema.user).values({
            id: "duplicate-github-user",
            name: "Duplicate GitHub User",
            email: "duplicate-github-user@example.com",
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            githubId: user.githubId,
            githubUsername: user.githubUsername,
        }),
    ).rejects.toThrow();
});

test("github public repo stars quest is coming_soon and never records", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    // The stars quest is built but launch-gated (state "coming_soon"), so the
    // group does not fetch public repos or record a reward. Flip state back to
    // "available" in github-profile.ts to re-enable granting.
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    mocks.github.state.repos = [
        { name: "core", size: 10, stargazers_count: 50 },
        { name: "docs", size: 5, stargazers_count: 50 },
    ];
    await mocks.enable("github", "tinybird");

    mocks.github.state.requests = [];
    await checkQuestsForUser(env, user.id);
    const rewards = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "github_stars"));
    expect(rewards).toHaveLength(0);
    expect(
        mocks.github.state.requests.some((request) =>
            request.path.startsWith("/users/"),
        ),
    ).toBe(false);
});

test("quest check records elixpo intern easter egg once", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    const targetGithubId = 161_109_909;
    await db
        .update(schema.user)
        .set({
            githubId: targetGithubId,
            githubUsername: "elixpo",
        })
        .where(eq(schema.user.id, user.id));

    mocks.github.state.user = {
        ...mocks.github.state.user,
        id: targetGithubId,
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
        idempotencyKey: `quest:${ELIXPO_INTERN_QUEST_ID}:github:${targetGithubId}`,
        pollenAmount: 100,
        balanceBucket: "tier",
    });
});

test("quest check rewards every merged author without duplicating a legacy assignee", async ({
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
    const secondAuthorGithubId = 987654;

    await db.insert(schema.user).values({
        id: "github-quest-second-author",
        name: "Second Author",
        email: "second-author@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: secondAuthorGithubId,
        githubUsername: "second-author",
        tierBalance: 0,
        packBalance: 0,
    });

    seedQuestIssue(mocks.github.state, {
        issueNumber,
        title: issueTitle,
        goal: "Merge the quest PR.",
        reward: 17,
        assigneeGithubId: secondAuthorGithubId,
        assigneeLogin: "second-author",
        completedByPrNumber: 888,
        completedByGithubId: user.githubId,
        completedByLogin: user.githubUsername,
    });
    const seededIssue = mocks.github.state.questIssues.find(
        (issue) => issue.number === issueNumber,
    );
    seededIssue?.closedByPullRequestsReferences?.push({
        number: 889,
        mergedAt: new Date("2026-06-03T00:00:00Z").toISOString(),
        author: { databaseId: secondAuthorGithubId },
    });
    mocks.github.state.mergedPullRequests.push({
        number: 889,
        authorLogin: "second-author",
        mergedAt: new Date("2026-06-03T00:00:00Z").toISOString(),
    });

    // The migration gives an existing winner the same per-author key that new
    // checks produce, so the normal unique constraint prevents a second reward.
    const migratedRewardKey = `quest:${issueQuestId}:github:${secondAuthorGithubId}`;
    await db.insert(schema.rewards).values({
        id: migratedRewardKey,
        idempotencyKey: migratedRewardKey,
        userId: "github-quest-second-author",
        questId: issueQuestId,
        title: `Ship bounty #${issueNumber}: ${issueTitle}`,
        pollenAmount: 17,
        balanceBucket: "tier",
        earnedAt: new Date(),
    });

    await checkQuestsForUser(env, user.id);
    await checkQuestsForUser(env, "github-quest-second-author");

    // Recording does not credit either balance; pollen moves only when claimed.
    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo(user.tierBalance ?? 0);
    const [secondAuthorBalance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.githubId, secondAuthorGithubId));
    expect(secondAuthorBalance?.tierBalance).toBeCloseTo(0);

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

    expect(rewards).toHaveLength(2);
    expect(rewards).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                idempotencyKey: migratedRewardKey,
                userId: "github-quest-second-author",
            }),
            expect.objectContaining({
                idempotencyKey: `quest:${issueQuestId}:github:${user.githubId}`,
                userId: user.id,
                title: `Ship bounty #${issueNumber}: ${issueTitle}`,
                pollenAmount: 17,
                balanceBucket: "tier",
            }),
        ]),
    );
});

// Regression guard: each issue keeps its own quest id, and each author gets a
// per-user key under that issue.
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
        tierBalance: 0,
        packBalance: 0,
    });

    const issues = [
        {
            issueNumber: 901,
            authorGithubId: user.githubId,
            authorLogin: user.githubUsername,
            reward: 11,
        },
        {
            issueNumber: 902,
            authorGithubId: secondGithubId,
            authorLogin: "second-dev",
            reward: 13,
        },
    ];
    for (const issue of issues) {
        seedQuestIssue(mocks.github.state, {
            issueNumber: issue.issueNumber,
            title: `Community bounty #${issue.issueNumber}`,
            goal: "Merge the linked PR.",
            reward: issue.reward,
            completedByPrNumber: issue.issueNumber + 1000,
            completedByGithubId: issue.authorGithubId,
            completedByLogin: issue.authorLogin,
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
        `quest:github:issue:901:github:${user.githubId}`,
        `quest:github:issue:902:github:${secondGithubId}`,
    ]);
    // Both PR authors have their own issue's reward (901→user, 902→other).
    expect(
        issueRewards.find((g) => g.userId === user.id)?.pollenAmount,
    ).toBeCloseTo(11);
    expect(
        issueRewards.find((g) => g.userId === "community-issue-second-user")
            ?.pollenAmount,
    ).toBeCloseTo(13);
});

test("issue bounties with out-of-range rewards record nothing and do not fail the check", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    // The issue body is author-editable, so a reward of 0 or above the
    // MAX_REWARD_AMOUNT cap can appear at any time. Before the fix both
    // parsed into a quest definition and recordRewards threw on the amount,
    // failing every bounty in the same check, including the valid one.
    for (const issue of [
        { issueNumber: 951, reward: 10001 },
        { issueNumber: 953, reward: 0 },
        { issueNumber: 952, reward: 17 },
    ]) {
        seedQuestIssue(mocks.github.state, {
            issueNumber: issue.issueNumber,
            title: `Bounty #${issue.issueNumber}`,
            goal: "Merge the linked PR.",
            reward: issue.reward,
            completedByPrNumber: issue.issueNumber + 1000,
            completedByGithubId: user.githubId,
            completedByLogin: user.githubUsername,
        });
    }

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({
            idempotencyKey: schema.rewards.idempotencyKey,
            pollenAmount: schema.rewards.pollenAmount,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.balanceBucket, "tier"));
    const issueRewards = rewards.filter((g) =>
        g.idempotencyKey.startsWith("quest:github:issue:"),
    );
    expect(issueRewards).toHaveLength(1);
    expect(issueRewards[0].idempotencyKey).toBe(
        `quest:github:issue:952:github:${user.githubId}`,
    );
    expect(issueRewards[0].pollenAmount).toBeCloseTo(17);
});

// Regression guard: GitHub search returns at most 100 issues per page, so a
// bounty ranked past the first page must still be loaded and rewarded.
test("issue bounties beyond the first 100 quest issues still record", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    for (let issueNumber = 2000; issueNumber < 2100; issueNumber++) {
        seedQuestIssue(mocks.github.state, {
            issueNumber,
            title: `Open bounty #${issueNumber}`,
            goal: "Merge a focused PR.",
            reward: 1,
        });
    }
    seedQuestIssue(mocks.github.state, {
        issueNumber: 1999,
        title: "Bounty on the second page",
        goal: "Merge the linked PR.",
        reward: 9,
        completedByPrNumber: 3999,
        completedByGithubId: user.githubId,
        completedByLogin: user.githubUsername,
    });

    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({ idempotencyKey: schema.rewards.idempotencyKey })
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "github:issue:1999"));
    expect(rewards.map((reward) => reward.idempotencyKey)).toEqual([
        `quest:github:issue:1999:github:${user.githubId}`,
    ]);
});

// An approved app submission closes a quest through the bot's catalog PR, which
// credits the submitter as commit co-author. Co-authors on other PRs earn nothing,
// even when a GitHub user with the bot's login opens one on a catalog branch.
test("app-publish catalog PRs pay the co-authoring submitter; other PRs pay only their author", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    if (user.githubId === null) throw new Error("Expected fixture GitHub id");
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    const coAuthorGithubId = 515151;
    await db.insert(schema.user).values({
        id: "quest-co-author",
        name: "Co Author",
        email: "co-author@example.com",
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: coAuthorGithubId,
        githubUsername: "co-author",
        tierBalance: 0,
        packBalance: 0,
    });

    const mergedAt = new Date("2026-06-03T00:00:00Z").toISOString();
    mocks.github.state.commitAuthors = {
        5001: [247793354, user.githubId],
        5002: [616161, coAuthorGithubId],
    };
    for (const [issueNumber, pr] of [
        [
            931,
            {
                number: 5001,
                mergedAt,
                headRefName: "auto/app-4001-123-1",
                author: { __typename: "Bot", login: "pollinations-ai" },
            },
        ],
        [
            932,
            {
                number: 5002,
                mergedAt,
                headRefName: "auto/app-4002-123-1",
                author: {
                    __typename: "User",
                    login: "pollinations-ai",
                    databaseId: 616161,
                },
            },
        ],
    ] as const) {
        seedQuestIssue(mocks.github.state, {
            issueNumber,
            title: `Plug-in quest #${issueNumber}`,
            goal: "Publish the plug-in.",
            reward: 9,
            closed: true,
        });
        const issue = mocks.github.state.questIssues.at(-1);
        if (issue) issue.closedByPullRequestsReferences = [pr];
    }

    await checkQuestsForUser(env, user.id);
    await checkQuestsForUser(env, "quest-co-author");

    const rewards = await db
        .select({
            idempotencyKey: schema.rewards.idempotencyKey,
            userId: schema.rewards.userId,
        })
        .from(schema.rewards)
        .where(
            inArray(schema.rewards.questId, [
                "github:issue:931",
                "github:issue:932",
            ]),
        );
    expect(rewards).toEqual([
        {
            idempotencyKey: `quest:github:issue:931:github:${user.githubId}`,
            userId: user.id,
        },
    ]);
});

test("one GitHub request looks up the commit authors of every app-publish PR", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    if (user.githubId === null) throw new Error("Expected fixture GitHub id");
    mocks.github.state.user.created_at = new Date().toISOString();
    await mocks.enable("github", "tinybird");

    mocks.github.state.commitAuthors = {
        5011: [247793354, user.githubId],
        5012: [247793354, 717171],
    };
    for (const [issueNumber, prNumber] of [
        [941, 5011],
        [942, 5012],
    ]) {
        seedQuestIssue(mocks.github.state, {
            issueNumber,
            title: `Plug-in quest #${issueNumber}`,
            goal: "Publish the plug-in.",
            reward: 9,
            closed: true,
        });
        const issue = mocks.github.state.questIssues.at(-1);
        if (issue) {
            issue.closedByPullRequestsReferences = [
                {
                    number: prNumber,
                    mergedAt: new Date("2026-06-03T00:00:00Z").toISOString(),
                    headRefName: `auto/app-${prNumber}-123-1`,
                    author: { __typename: "Bot", login: "pollinations-ai" },
                },
            ];
        }
    }

    await env.KV.delete("quests:catalog:v30");
    mocks.github.state.requests = [];
    const response = await SELF.fetch(
        "http://localhost:3000/api/quests/catalog",
    );
    expect(response.status).toBe(200);
    // One issue search page plus one commit-author lookup for both PRs.
    expect(
        mocks.github.state.requests.filter(({ path }) => path === "/graphql"),
    ).toHaveLength(2);

    await checkQuestsForUser(env, user.id);
    const rewards = await db
        .select({ questId: schema.rewards.questId })
        .from(schema.rewards)
        .where(
            inArray(schema.rewards.questId, [
                "github:issue:941",
                "github:issue:942",
            ]),
        );
    expect(rewards).toEqual([{ questId: "github:issue:941" }]);
});

test("reporters earn 3 Pollen per issue fixed since the 90-day cutoff, including converted quests", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    const afterLaunch = "2026-09-24T12:00:00Z";
    const excludedTitles: Record<number, string> = {
        9107: "[Community Publisher Access]: Example",
        9109: "[App Submission]: Example",
        9110: "[Project Submission]: Example",
        9111: "[QUEST]: Example",
    };
    const issues = [
        { number: 9101, labels: [], mergedAt: afterLaunch },
        { number: 9102, labels: [{ name: "BUG" }], mergedAt: afterLaunch },
        { number: 9103, labels: [], mergedAt: "2026-06-25T19:45:45Z" },
        {
            number: 9104,
            labels: [{ name: "APP-SUBMISSION" }],
            mergedAt: afterLaunch,
        },
        {
            number: 9105,
            labels: [{ name: "POLLEN-QUEST" }],
            mergedAt: afterLaunch,
        },
        { number: 9106, labels: [], mergedAt: null },
        { number: 9107, labels: [], mergedAt: afterLaunch },
        { number: 9108, labels: [], mergedAt: "2026-06-25T19:45:46Z" },
        { number: 9109, labels: [], mergedAt: afterLaunch },
        { number: 9110, labels: [], mergedAt: afterLaunch },
        { number: 9111, labels: [], mergedAt: afterLaunch },
    ];
    for (const issue of issues) {
        mocks.github.state.questIssues.push({
            number: issue.number,
            state: "closed",
            title: excludedTitles[issue.number] ?? `Issue ${issue.number}`,
            html_url: `https://github.com/pollinations/pollinations/issues/${issue.number}`,
            body: "A useful issue report",
            created_at: "2026-09-22T00:00:00Z",
            updated_at: afterLaunch,
            closed_at: afterLaunch,
            user: {
                login: user.githubUsername ?? "",
                databaseId: user.githubId,
            },
            labels: issue.labels,
            closedByPullRequestsReferences: [
                {
                    number: issue.number + 1000,
                    mergedAt: issue.mergedAt,
                    author: { databaseId: 999999 },
                },
            ],
        });
    }

    await checkQuestsForUser(env, user.id);
    await checkQuestsForUser(env, user.id);

    const rewards = await db
        .select({
            id: schema.rewards.id,
            idempotencyKey: schema.rewards.idempotencyKey,
            pollenAmount: schema.rewards.pollenAmount,
            balanceBucket: schema.rewards.balanceBucket,
        })
        .from(schema.rewards)
        .where(eq(schema.rewards.userId, user.id));
    const reportRewards = rewards.filter((reward) =>
        reward.idempotencyKey.startsWith("quest:github:reported_issue:"),
    );
    expect(reportRewards.map((reward) => reward.idempotencyKey).sort()).toEqual(
        [
            `quest:github:reported_issue:9101:github:${user.githubId}`,
            `quest:github:reported_issue:9102:github:${user.githubId}`,
            `quest:github:reported_issue:9105:github:${user.githubId}`,
            `quest:github:reported_issue:9108:github:${user.githubId}`,
            `quest:github:reported_issue:9111:github:${user.githubId}`,
        ],
    );
    expect(reportRewards.map((reward) => reward.pollenAmount)).toEqual([
        3, 3, 3, 3, 3,
    ]);
    expect(
        reportRewards.every((reward) => reward.balanceBucket === "tier"),
    ).toBe(true);

    for (const reward of reportRewards) {
        expect(
            (await claimReward(db, { rewardId: reward.id, userId: user.id }))
                .claimed,
        ).toBe(true);
    }
    const [balance] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, user.id));
    expect(balance?.tierBalance).toBeCloseTo((user.tierBalance ?? 0) + 15);
});

test("Bee Census quest pays 3 Pollen once for the user's own labelled survey issue with enough written answers", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    const survey = (
        number: number,
        title: string,
        databaseId: number,
        written: [string, string],
        labels = [{ name: "BEE-CENSUS" }],
    ) => ({
        number,
        state: "open" as const,
        title,
        labels,
        html_url: `https://github.com/pollinations/pollinations/issues/${number}`,
        body: [
            "### What kind of bee are you?\n\n🧪 Hobbyist / tinkerer",
            `### What would make you pay this month?\n\n${written[0]}`,
            `### What did you last try to build that Pollinations couldn't do?\n\n${written[1]}`,
            "### 🔥 Roast us in one sentence (optional)\n\n_No response_",
        ].join("\n\n"),
        created_at: "2026-09-29T00:00:00Z",
        updated_at: "2026-09-29T00:00:00Z",
        closed_at: null,
        user: { login: user.githubUsername ?? "", databaseId },
    });
    const beeCensusRewards = async () =>
        (
            await db
                .select({
                    idempotencyKey: schema.rewards.idempotencyKey,
                    pollenAmount: schema.rewards.pollenAmount,
                    balanceBucket: schema.rewards.balanceBucket,
                })
                .from(schema.rewards)
                .where(eq(schema.rewards.userId, user.id))
        ).filter((reward) => reward.idempotencyKey.includes("bee_census"));

    mocks.github.state.questIssues.push(
        survey(9201, "[Bee Census] hello", user.githubId ?? 0, [
            "cheaper",
            "all good",
        ]),
        survey(9203, "[Bee Census] renamed account", 999999, [
            "A $5 plan that includes the image models I use every day.",
            "A Discord bot that answers by voice.",
        ]),
        survey(
            9204,
            "[Bee Census] typed without the form",
            user.githubId ?? 0,
            [
                "A $5 plan that includes the image models I use every day.",
                "A Discord bot that answers by voice.",
            ],
            [],
        ),
        // Invisible characters don't count towards the written minimum.
        survey(9205, "[Bee Census] filler", user.githubId ?? 0, [
            "\u200e\u200e ".repeat(40),
            "\u200e\u200e ".repeat(40),
        ]),
    );
    await checkQuestsForUser(env, user.id);
    expect(await beeCensusRewards()).toEqual([]);

    mocks.github.state.questIssues.push(
        survey(9202, "developer", user.githubId ?? 0, [
            "A $5 plan that includes the image models I use every day.",
            "A Discord bot that answers by voice.",
        ]),
    );
    await checkQuestsForUser(env, user.id);
    await checkQuestsForUser(env, user.id);

    expect(await beeCensusRewards()).toEqual([
        {
            idempotencyKey: `quest:bee_census:github:${user.githubId}`,
            pollenAmount: 3,
            balanceBucket: "tier",
        },
    ]);
});

test("Honey Census quest pays 5 Pollen only once the survey author has bought more than 2 Pollen", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await getOnlyUser();
    await mocks.enable("github", "tinybird");

    mocks.github.state.questIssues.push({
        number: 9301,
        state: "open" as const,
        title: "[Honey Census] ",
        labels: [{ name: "HONEY-CENSUS" }],
        html_url: "https://github.com/pollinations/pollinations/issues/9301",
        body: [
            "### Why did you first buy Pollen?\n\nI ran out of Quest Pollen",
            "### What would make you use Pollinations more?\n\nCheaper video models and a monthly invoice for my company.",
            "### Which other AI tools or services do you pay for, and what for?\n\nElevenLabs for character voices, about $22 a month.",
        ].join("\n\n"),
        created_at: "2026-09-30T00:00:00Z",
        updated_at: "2026-09-30T00:00:00Z",
        closed_at: null,
        user: {
            login: user.githubUsername ?? "",
            databaseId: user.githubId ?? 0,
        },
    });
    const honeyCensusRewards = async () =>
        (
            await db
                .select({
                    idempotencyKey: schema.rewards.idempotencyKey,
                    pollenAmount: schema.rewards.pollenAmount,
                    balanceBucket: schema.rewards.balanceBucket,
                })
                .from(schema.rewards)
                .where(eq(schema.rewards.userId, user.id))
        ).filter((reward) => reward.idempotencyKey.includes("honey_census"));

    await checkQuestsForUser(env, user.id);
    expect(await honeyCensusRewards()).toEqual([]);

    // The smallest pack alone doesn't qualify.
    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: "cs_test_honey_census_small",
        eventId: "evt_test_honey_census_small",
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 2,
    });
    await checkQuestsForUser(env, user.id);
    expect(await honeyCensusRewards()).toEqual([]);

    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: "cs_test_honey_census",
        eventId: "evt_test_honey_census",
        eventType: "checkout.session.completed",
        userId: user.id,
        pollenCredited: 5,
    });
    await checkQuestsForUser(env, user.id);

    expect(await honeyCensusRewards()).toEqual([
        {
            idempotencyKey: `quest:honey_census:github:${user.githubId}`,
            pollenAmount: 5,
            balanceBucket: "tier",
        },
    ]);
});

test("account quest history includes pending and claimed GitHub quest rewards", async ({
    accountToken,
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
        "http://localhost:3000/api/account/quests/rewards",
        {
            headers: {
                Authorization: `Bearer ${accountToken}`,
            },
        },
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
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

    // Flat list: clients derive claimed/claimable totals from the rewards
    // themselves. Here the one reward is unclaimed and worth 5 pollen.
    expect(payload.rewards).toHaveLength(1);
    expect(payload.rewards[0].claimedAt).toBeNull();
    expect(payload.rewards[0].pollenAmount).toBe(5);
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
        "http://localhost:3000/api/account/quests/rewards",
        {
            headers: {
                authorization: `Bearer ${apiKey}`,
            },
        },
    );

    expect(response.status).toBe(403);
});

test("account quest history accepts account usage permission", async ({
    accountToken,
}) => {
    const usageKey = await createUsageApiKey(
        accountToken,
        "quest-rewards-usage-key",
    );
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/quests/rewards",
        {
            headers: {
                authorization: `Bearer ${usageKey}`,
            },
        },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        rewards: [{ questId: "first_api_key" }],
    });
});

// Setup reward holds: private email domains with more than 30 sign-ups in 24
// hours are flagged; while holds are on, their accounts' setup rewards wait.
const HOLDS_ON = { ...env, SETUP_REWARD_HOLDS: "on" };
const HOLDS_OFF = { ...env, SETUP_REWARD_HOLDS: "off" };
const DAY_SECONDS = 24 * 60 * 60;
const REPORT_WEBHOOK = "https://discord.test/api/webhooks/setup-rewards";

/** Google-only accounts with an API key: their next check earns first_api_key. */
async function seedSetupAccounts(
    prefix: string,
    count: number,
    domain: string,
): Promise<string[]> {
    const db = drizzle(env.DB, { schema });
    const now = new Date();
    const ids = Array.from(
        { length: count },
        (_, index) => `${prefix}-${index}`,
    );
    for (const id of ids) {
        await db.insert(schema.user).values({
            id,
            name: id,
            email: `${id}@${domain}`,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            tierBalance: 0,
            packBalance: 0,
        });
        await db.insert(schema.account).values({
            id: `${id}-google`,
            accountId: `google-${id}`,
            providerId: "google",
            userId: id,
        });
        await db.insert(schema.apikey).values({
            id: `${id}-key`,
            name: "Key",
            key: `sk_${id}`,
            prefix: "sk",
            referenceId: id,
            createdAt: now,
            updatedAt: now,
        });
    }
    return ids;
}

function earnFirstKey(bindings: typeof HOLDS_ON, userId: string) {
    return checkQuestsForUser(bindings, userId, [
        questIndex.ACCOUNT_SETUP_QUEST_GROUP,
    ]);
}

/** A quest every account completes, e.g. a later onboarding reward. */
function completedQuestGroup(
    questId: string,
    category: QuestCategory = "setup",
): QuestGroup {
    const quest: QuestDefinition = {
        id: questId,
        title: questId,
        description: "",
        category,
        scope: "perUser",
        rewardAmount: 0.25,
        balanceBucket: "tier",
    };
    return {
        id: questId,
        listQuestCards: async () => [],
        evaluateUser: async (_ctx, user) => ({
            proposals: [{ quest, userId: user.id }],
        }),
    };
}

async function flaggedDomains() {
    return drizzle(env.DB, { schema }).select().from(schema.flaggedEmailDomain);
}

async function tierBalanceOf(userId: string) {
    const [row] = await drizzle(env.DB, { schema })
        .select({ value: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
    return row?.value ?? 0;
}

async function questReward(userId: string, questId: string) {
    const [reward] = await drizzle(env.DB, { schema })
        .select()
        .from(schema.rewards)
        .where(
            and(
                eq(schema.rewards.userId, userId),
                eq(schema.rewards.questId, questId),
            ),
        );
    if (!reward) throw new Error(`Expected ${questId} reward`);
    return reward;
}

/** Claims as the dashboard does while holds are on. */
async function claimSetupReward(userId: string, questId: string) {
    const reward = await questReward(userId, questId);
    const result = await claimReward(drizzle(env.DB, { schema }), {
        rewardId: reward.id,
        userId,
        setupQuestIds: new Set([questId]),
    });
    return result.claimed;
}

/** Records Discord webhook posts; any other fetch fails the test. */
function stubDiscord(status: number) {
    const posts: { embeds: { description: string; color: number }[] }[] = [];
    vi.stubGlobal(
        "fetch",
        async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) !== REPORT_WEBHOOK) {
                throw new Error(`Unexpected fetch: ${String(input)}`);
            }
            posts.push(JSON.parse(String(init?.body)));
            return new Response(null, { status });
        },
    );
    return posts;
}

test("setup rewards: the claim guard covers every setup quest in the catalog", async ({
    mocks,
}) => {
    await mocks.enable("github");
    const ctx = { db: drizzle(env.DB, { schema }), env };
    const catalogSetupIds = (await questIndex.listQuestCards(ctx))
        .filter((card) => card.category === "setup")
        .map((card) => card.id);
    expect(catalogSetupIds).toContain("first_api_key");
    expect([...(await questIndex.listSetupQuestIds(ctx))].sort()).toEqual(
        catalogSetupIds.sort(),
    );
});

test("setup rewards: the 31st sign-up flags a private domain and holds all its accounts", async () => {
    const ids = await seedSetupAccounts("farm", 31, "farm.test");
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);

    expect(await flaggedDomains()).toMatchObject([
        { domain: "farm.test", accounts: 31, allowedAt: null },
    ]);
    // The first 30 were paid before the flag; the 31st is held.
    expect(await tierBalanceOf(ids[29])).toBeCloseTo(0.25);
    expect(await tierBalanceOf(ids[30])).toBe(0);
    expect((await questReward(ids[30], "first_api_key")).claimedAt).toBeNull();
    // A flag covers every account on the domain, including earlier ones.
    await checkQuestsForUser(HOLDS_ON, ids[0], [
        completedQuestGroup("later_setup"),
    ]);
    expect(await claimSetupReward(ids[0], "later_setup")).toBe(false);
});

test("setup rewards: subdomains count as the domain a registrant controls", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("sub", 31, "sub.test");
    for (const [index, id] of ids.entries()) {
        await db
            .update(schema.user)
            .set({ email: `${id}@a${index}.sub.test` })
            .where(eq(schema.user.id, id));
    }
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);

    expect(await flaggedDomains()).toMatchObject([{ domain: "sub.test" }]);
    expect(await tierBalanceOf(ids[30])).toBe(0);
    expect(registrableDomain("x@mail.farm.co.uk")).toBe("farm.co.uk");
    expect(registrableDomain("x@school.k12.ca.us")).toBe("school.k12.ca.us");
    expect(registrableDomain("x@a_1.sub.test.")).toBe("sub.test");
    expect(registrableDomain("x@co.uk")).toBeNull();
});

test("setup rewards: public mail domains are never recorded or flagged", async () => {
    const ids = await seedSetupAccounts("mail", 31, "fastmail.com");
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);

    expect(await flaggedDomains()).toEqual([]);
    expect(
        await drizzle(env.DB, { schema })
            .select()
            .from(schema.setupRewardSignup),
    ).toEqual([]);
    expect(await tierBalanceOf(ids[30])).toBeCloseTo(0.25);
});

test("setup rewards: concurrent sign-ups flag a domain once and retries count once", async () => {
    const posts = stubDiscord(204);
    try {
        const reporting = {
            ...HOLDS_ON,
            SETUP_REWARD_DISCORD_WEBHOOK_URL: REPORT_WEBHOOK,
        };
        const ids = await seedSetupAccounts("burst", 35, "burst.test");
        await Promise.all(ids.map((id) => earnFirstKey(reporting, id)));
        expect(await flaggedDomains()).toMatchObject([
            { domain: "burst.test", accounts: 31 },
        ]);
        expect(posts).toHaveLength(1);
        expect(posts[0].embeds[0].color).toBe(0xd85a30);
        expect(posts[0].embeds[0].description).toContain(
            "FLAGGED: domain burst.test",
        );
        expect(posts[0].embeds[0].description).toContain(
            "DECISION onboarding rewards held",
        );

        const [retry] = await seedSetupAccounts("retry", 1, "retry.test");
        await Promise.all(
            Array.from({ length: 5 }, () => earnFirstKey(reporting, retry)),
        );
        const rows = await drizzle(env.DB, { schema })
            .select()
            .from(schema.setupRewardSignup)
            .where(eq(schema.setupRewardSignup.emailDomain, "retry.test"));
        expect(rows).toHaveLength(1);
        expect(await tierBalanceOf(retry)).toBeCloseTo(0.25);
    } finally {
        vi.unstubAllGlobals();
    }
});

test("setup rewards: a flag outlasts the 24-hour window and 30-day cleanup", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("old", 31, "old.test");
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);
    await db.update(schema.setupRewardSignup).set({
        firstRewardAt: sql`${schema.setupRewardSignup.firstRewardAt} - ${31 * DAY_SECONDS}`,
    });

    const [late] = await seedSetupAccounts("late", 1, "old.test");
    await earnFirstKey(HOLDS_ON, late);

    // Cleanup deleted the 31 old sign-ups; the flag and the hold remain.
    const signups = await db.select().from(schema.setupRewardSignup);
    expect(signups.map((row) => row.userId)).toEqual([late]);
    expect(await flaggedDomains()).toHaveLength(1);
    expect(await tierBalanceOf(late)).toBe(0);
});

test("setup rewards: returning accounts don't count as new sign-ups", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("back", 30, "back.test");
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);
    await db.update(schema.setupRewardSignup).set({
        firstRewardAt: sql`${schema.setupRewardSignup.firstRewardAt} - ${31 * DAY_SECONDS}`,
    });
    // Another domain's sign-up runs the cleanup of the 30 old rows.
    const [other] = await seedSetupAccounts("back-other", 1, "elsewhere.test");
    await earnFirstKey(HOLDS_ON, other);

    for (const id of ids) {
        await checkQuestsForUser(HOLDS_ON, id, [
            completedQuestGroup("later_setup"),
        ]);
    }
    const [newcomer] = await seedSetupAccounts("back-new", 1, "back.test");
    await earnFirstKey(HOLDS_ON, newcomer);

    expect(await flaggedDomains()).toEqual([]);
    expect(await tierBalanceOf(newcomer)).toBeCloseTo(0.25);
});

test("setup rewards: one GitHub account unlocks each setup reward once, even across deleted accounts", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("gh", 32, "gh.test");
    for (const id of ids.slice(0, 31)) await earnFirstKey(HOLDS_ON, id);
    const [first, second] = [ids[30], ids[31]];
    const githubId = hashGithubId("shared-github");
    const linkGitHub = (userId: string) =>
        db
            .update(schema.user)
            .set({
                githubId,
                githubUsername: "shared-github",
                githubCreatedAt: new Date(Date.now() - 40 * DAY_SECONDS * 1000),
            })
            .where(eq(schema.user.id, userId));

    await linkGitHub(first);
    expect(await claimSetupReward(first, "first_api_key")).toBe(true);
    // The reward keeps its Google key; the GitHub binding is its own row.
    expect((await questReward(first, "first_api_key")).idempotencyKey).toBe(
        `quest:first_api_key:google:google-${first}`,
    );
    expect(await db.select().from(schema.setupRewardGithubClaim)).toMatchObject(
        [{ githubId, questId: "first_api_key" }],
    );

    // The first account is deleted; its reward stays in the ledger.
    await db.delete(schema.user).where(eq(schema.user.id, first));
    await earnFirstKey(HOLDS_ON, second);
    await linkGitHub(second);
    expect(await claimSetupReward(second, "first_api_key")).toBe(false);
    expect(await tierBalanceOf(second)).toBe(0);
});

test("setup rewards: deleted accounts still count toward the limit", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("gone", 31, "gone.test");
    const last = ids.pop() as string;
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);
    await db.delete(schema.user).where(inArray(schema.user.id, ids));

    await earnFirstKey(HOLDS_ON, last);
    expect(await flaggedDomains()).toMatchObject([{ domain: "gone.test" }]);
    expect(await tierBalanceOf(last)).toBe(0);
});

test("setup rewards: a purchase or a 30-day-old GitHub account verifies; allowing the domain releases it", async () => {
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("verify", 33, "verify.test");
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);
    const [buyer, coder, other] = ids.slice(30);
    for (const id of [buyer, coder, other]) {
        expect(await claimSetupReward(id, "first_api_key")).toBe(false);
    }

    await db.insert(schema.stripeCheckoutCredits).values({
        sessionId: "cs_verify",
        eventId: "evt_verify",
        eventType: "checkout.session.completed",
        userId: buyer,
        pollenCredited: 5,
        createdAt: new Date(),
    });
    expect(await claimSetupReward(buyer, "first_api_key")).toBe(true);

    // A GitHub account verifies only once it is at least 30 days old.
    const linkGitHub = (ageDays: number) =>
        db
            .update(schema.user)
            .set({
                githubId: hashGithubId(coder),
                githubUsername: coder,
                githubCreatedAt: new Date(
                    Date.now() - ageDays * DAY_SECONDS * 1000,
                ),
            })
            .where(eq(schema.user.id, coder));
    await linkGitHub(5);
    expect(await claimSetupReward(coder, "first_api_key")).toBe(false);
    await linkGitHub(40);
    expect(await claimSetupReward(coder, "first_api_key")).toBe(true);

    // Allowing the domain releases everyone on it and keeps it from re-flagging.
    await db
        .update(schema.flaggedEmailDomain)
        .set({ allowedAt: new Date() })
        .where(eq(schema.flaggedEmailDomain.domain, "verify.test"));
    expect(await claimSetupReward(other, "first_api_key")).toBe(true);
    const [newcomer] = await seedSetupAccounts("verify-new", 1, "verify.test");
    await earnFirstKey(HOLDS_ON, newcomer);
    expect(await tierBalanceOf(newcomer)).toBeCloseTo(0.25);
    expect(await flaggedDomains()).toHaveLength(1);
});

test("setup rewards: a held account creates keys and sees held in the API, while other rewards pay", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    const db = drizzle(env.DB, { schema });
    const ids = await seedSetupAccounts("held", 31, "held.test");
    const held = ids.pop() as string;
    for (const id of ids) await earnFirstKey(HOLDS_ON, id);
    await earnFirstKey(HOLDS_ON, held);
    const token = await signSessionToken({
        secret: env.BETTER_AUTH_SECRET,
        userId: held,
    });

    await createApiKeyViaApi(token, { name: "held-account-key" });
    const firstKey = await questReward(held, "first_api_key");
    expect(firstKey.claimedAt).toBeNull();

    const get = async (path: string) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/account/${path}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(response.status).toBe(200);
        return response.json();
    };
    const claim = async (rewardId: string) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/account/quests/rewards/${rewardId}/claim`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            },
        );
        expect(response.status).toBe(200);
        return ((await response.json()) as { claimed: boolean }).claimed;
    };

    expect(await get("quests/rewards")).toMatchObject({
        held: true,
        rewards: [{ questId: "first_api_key" }],
    });
    expect(await claim(firstKey.id)).toBe(false);

    await recordRewards(db, [
        {
            idempotencyKey: "promo:held-account",
            userId: held,
            questId: "promo:launch",
            title: "Promo",
            amount: 1,
            bucket: "tier",
        },
        {
            idempotencyKey: "quest:merged_pr:held-account",
            userId: held,
            questId: "merged_pr",
            title: "Contribute a pull request",
            amount: 5,
            bucket: "tier",
        },
    ]);
    for (const questId of ["promo:launch", "merged_pr"]) {
        expect(await claim((await questReward(held, questId)).id)).toBe(true);
    }
    expect(await tierBalanceOf(held)).toBeCloseTo(6);
});

test("setup rewards: a failed sign-up write records no setup reward until the next check", async () => {
    const [id] = await seedSetupAccounts("offline", 1, "offline.test");
    const groups = [
        questIndex.ACCOUNT_SETUP_QUEST_GROUP,
        completedQuestGroup("offline_contribution", "contribute"),
    ];

    await env.DB.exec(
        "ALTER TABLE setup_reward_signup RENAME TO setup_reward_signup_offline",
    );
    try {
        const failed = await checkQuestsForUser(HOLDS_ON, id, groups);
        expect(failed.recorded).toBe(1);
        expect(failed.success).toBe(false);
    } finally {
        await env.DB.exec(
            "ALTER TABLE setup_reward_signup_offline RENAME TO setup_reward_signup",
        );
    }
    await expect(questReward(id, "first_api_key")).rejects.toThrow();
    await questReward(id, "offline_contribution");

    const retried = await checkQuestsForUser(HOLDS_ON, id, groups);
    expect(retried.recorded).toBe(1);
    expect(retried.success).toBe(true);
    expect((await questReward(id, "first_api_key")).claimedAt).not.toBeNull();
});

test("setup rewards: with holds off a domain is flagged and reported but nothing is held", async () => {
    const posts = stubDiscord(500);
    try {
        const reporting = {
            ...HOLDS_OFF,
            ENVIRONMENT: "staging",
            SETUP_REWARD_DISCORD_WEBHOOK_URL: REPORT_WEBHOOK,
        };
        const ids = await seedSetupAccounts("watch", 31, "watch.test");
        let last: Awaited<ReturnType<typeof checkQuestsForUser>> | undefined;
        for (const id of ids) last = await earnFirstKey(reporting, id);

        // A failed Discord post doesn't affect the check.
        expect(last?.success).toBe(true);
        expect(posts).toHaveLength(1);
        expect(posts[0].embeds[0].color).toBe(0xef9f27);
        expect(posts[0].embeds[0].description).toContain(
            "[staging] FLAGGED: domain watch.test",
        );
        expect(posts[0].embeds[0].description).toContain(
            "DECISION recorded only, holds are off",
        );
        expect(await flaggedDomains()).toHaveLength(1);
        expect(await tierBalanceOf(ids[30])).toBeCloseTo(0.25);

        // Switching holds on holds the flagged domain's accounts.
        await checkQuestsForUser(HOLDS_ON, ids[30], [
            completedQuestGroup("switched_on"),
        ]);
        expect(await claimSetupReward(ids[30], "switched_on")).toBe(false);
    } finally {
        vi.unstubAllGlobals();
    }
});
