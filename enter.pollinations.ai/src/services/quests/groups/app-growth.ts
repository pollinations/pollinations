import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import { type QuestDefinition, rewardableQuests } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
    type RewardProposal,
} from "../types.ts";

const log = getLogger(["enter", "quests", "app-growth"]);

/**
 * App-growth quests intentionally share one source group even though they render
 * in different frontend categories. The category is part of each quest
 * definition; the source file only describes where completion data comes from.
 */

type QuestUserRow = {
    userId: string;
};

type AppDirectoryRow = {
    github_user_id: string;
};

type AppUsageRow = QuestUserRow & {
    pollenUsed: number;
    paidRequests: number;
};

type AppReachRow = QuestUserRow & {
    externalUsers: number;
};

const firstByopExternalUserQuest: QuestDefinition = {
    id: "app_active",
    title: "First user connects to your app",
    description:
        "A user logs in to your app using the [authorize](https://gen.pollinations.ai/docs#tag/byop) flow.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 7,
    balanceBucket: "tier",
};

const firstPaidSpendInAppQuest: QuestDefinition = {
    id: "app_paid_request",
    title: "First Paid Pollen request",
    description:
        "Your [BYOP](https://gen.pollinations.ai/docs#tag/byop) app processes its first successful request using Paid Pollen.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 15,
    balanceBucket: "tier",
};

const growingAppQuest: QuestDefinition = {
    id: "app_growing",
    title: "Your apps reach three users",
    description:
        "At least three external users connect and your [BYOP](https://gen.pollinations.ai/docs#tag/byop) apps process 1 Pollen of billed usage.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 20,
    balanceBucket: "tier",
};

const thrivingAppQuest: QuestDefinition = {
    id: "app_thriving",
    title: "Your apps reach ten users",
    description:
        "At least ten external users connect and your [BYOP](https://gen.pollinations.ai/docs#tag/byop) apps process 10 Pollen of billed usage.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 50,
    balanceBucket: "tier",
};

const appListedQuest: QuestDefinition = {
    id: "app_listed",
    title: "App listed on Pollinations",
    description:
        "Submit your app for review, get it approved, and have it listed in the [app directory](https://pollinations.ai/apps).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
    url: "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml",
};

const QUESTS = [
    firstByopExternalUserQuest,
    firstPaidSpendInAppQuest,
    growingAppQuest,
    thrivingAppQuest,
    appListedQuest,
];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposalsForUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const rewardableQuestIds = new Set(
        rewardableQuests(QUESTS).map((quest) => quest.id),
    );
    if (rewardableQuestIds.size === 0) {
        log.info(
            "APP_GROWTH_SKIPPED: userId={userId} reason=no_rewardable_quests",
            {
                userId: user.id,
            },
        );
        return [];
    }

    const usageQuestIds = [
        firstPaidSpendInAppQuest.id,
        growingAppQuest.id,
        thrivingAppQuest.id,
    ];
    const [appUsage, appReach, listedAppRows] = await Promise.all([
        usageQuestIds.some((id) => rewardableQuestIds.has(id))
            ? loadAppUsage(ctx, user)
            : null,
        rewardableQuestIds.has(firstByopExternalUserQuest.id)
            ? loadAppReach(ctx, user)
            : null,
        rewardableQuestIds.has(appListedQuest.id)
            ? loadListedAppOwner(ctx, user)
            : [],
    ]);

    const proposals = [
        ...(appReach &&
        appReach.externalUsers >= 1 &&
        rewardableQuestIds.has(firstByopExternalUserQuest.id)
            ? [{ quest: firstByopExternalUserQuest, userId: user.id }]
            : []),
        ...(appUsage &&
        appUsage.paidRequests >= 1 &&
        rewardableQuestIds.has(firstPaidSpendInAppQuest.id)
            ? [{ quest: firstPaidSpendInAppQuest, userId: user.id }]
            : []),
        ...(appUsage &&
        appReach &&
        appReach.externalUsers >= 3 &&
        appUsage.pollenUsed >= 1 &&
        rewardableQuestIds.has(growingAppQuest.id)
            ? [{ quest: growingAppQuest, userId: user.id }]
            : []),
        ...(appUsage &&
        appReach &&
        appReach.externalUsers >= 10 &&
        appUsage.pollenUsed >= 10 &&
        rewardableQuestIds.has(thrivingAppQuest.id)
            ? [{ quest: thrivingAppQuest, userId: user.id }]
            : []),
        ...listedAppRows.map((row) => ({
            quest: appListedQuest,
            userId: row.userId,
        })),
    ];
    log.info(
        "APP_GROWTH_PROPOSALS: userId={userId} byopOwnerRows={byop} externalUsers={externalUsers} pollenUsed={pollenUsed} paidRequests={paidRequests} listedAppRows={listed} questIds={questIds}",
        {
            userId: user.id,
            byop: appReach ? 1 : 0,
            externalUsers: appReach?.externalUsers ?? 0,
            pollenUsed: appUsage?.pollenUsed ?? 0,
            paidRequests: appUsage?.paidRequests ?? 0,
            listed: listedAppRows.length,
            questIds: proposals.map((p) => p.quest.id),
        },
    );
    return proposals;
}

async function loadAppUsage(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<AppUsageRow | null> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<AppUsageRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_app_usage.json",
        tinybirdToken,
        { user_id: user.id },
    );
    const matched = rows.find((row) => row.userId === user.id) ?? null;
    // Same before/after-filter visibility as model-usage: an un-redeployed/global
    // pipe returns rows for everyone, which the client filter then drops to 0.
    log.info(
        "APP_GROWTH_USAGE: userId={userId} pipeRows={pipeRows} matched={matched}",
        {
            userId: user.id,
            pipeRows: rows.length,
            matched: matched !== null,
        },
    );
    return matched;
}

async function loadListedAppOwner(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestUserRow[]> {
    if (user.githubId === null) return [];

    const githubUserId = String(user.githubId);
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<AppDirectoryRow>(
        tinybirdOrigin,
        "/v0/pipes/app_directory_public.json",
        tinybirdToken,
        { limit: "5000" },
    );
    const listed = rows.some((row) => row.github_user_id === githubUserId);
    log.info(
        "APP_GROWTH_APP_LISTED: userId={userId} githubId={githubId} directoryRows={rows} listed={listed}",
        {
            userId: user.id,
            githubId: user.githubId,
            rows: rows.length,
            listed,
        },
    );

    return listed ? [{ userId: user.id }] : [];
}

async function loadAppReach(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<AppReachRow | null> {
    const rows = await db.all<AppReachRow>(
        sql`
        SELECT
            app_key.user_id AS userId,
            COUNT(DISTINCT user_key.user_id) AS externalUsers
        FROM apikey AS user_key
        INNER JOIN apikey AS app_key
            ON app_key.id = user_key.byop_client_key_id
        WHERE app_key.user_id = ${user.id}
          AND user_key.user_id != app_key.user_id
        GROUP BY app_key.user_id
        LIMIT 1`,
    );

    return rows.find((row) => row.userId === user.id) ?? null;
}
