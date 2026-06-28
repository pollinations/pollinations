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

const firstByopExternalUserQuest: QuestDefinition = {
    id: "app_active",
    title: "Your app is being used",
    description:
        "A user logs in to your app using the [authorize](https://gen.pollinations.ai/docs#tag/byop) flow.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 10,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const firstPaidSpendInAppQuest: QuestDefinition = {
    id: "app_paid_request",
    title: "User pays in your app",
    description:
        "A user makes a paid request in your [BYOP](https://gen.pollinations.ai/docs#tag/byop) app.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 20,
    balanceBucket: "tier",
    // Built but not launched — hidden from the UI, not grantable.
    state: "coming_soon",
};

const appListedQuest: QuestDefinition = {
    id: "app_listed",
    title: "App listed on Pollinations",
    description:
        "Submit your app for review, get it approved, and have it listed in the [app directory](https://pollinations.ai/apps).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 15,
    balanceBucket: "tier",
    url: "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml",
};

const QUESTS = [
    firstByopExternalUserQuest,
    firstPaidSpendInAppQuest,
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

    const [paidSpendRows, byopExternalRows, listedAppRows] = await Promise.all([
        rewardableQuestIds.has(firstPaidSpendInAppQuest.id)
            ? loadPaidSpendAppOwner(ctx, user)
            : [],
        rewardableQuestIds.has(firstByopExternalUserQuest.id)
            ? loadByopExternalAppOwner(ctx, user)
            : [],
        rewardableQuestIds.has(appListedQuest.id)
            ? loadListedAppOwner(ctx, user)
            : [],
    ]);

    const proposals = [
        ...byopExternalRows.map((row) => ({
            quest: firstByopExternalUserQuest,
            userId: row.userId,
        })),
        ...paidSpendRows.map((row) => ({
            quest: firstPaidSpendInAppQuest,
            userId: row.userId,
        })),
        ...listedAppRows.map((row) => ({
            quest: appListedQuest,
            userId: row.userId,
        })),
    ];
    log.info(
        "APP_GROWTH_PROPOSALS: userId={userId} byopOwnerRows={byop} paidSpendRows={paid} listedAppRows={listed} questIds={questIds}",
        {
            userId: user.id,
            byop: byopExternalRows.length,
            paid: paidSpendRows.length,
            listed: listedAppRows.length,
            questIds: proposals.map((p) => p.quest.id),
        },
    );
    return proposals;
}

async function loadPaidSpendAppOwner(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestUserRow[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<QuestUserRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_paid_app_spend.json",
        tinybirdToken,
        { user_id: user.id },
    );
    const matched = uniqueUsers(rows).filter((row) => row.userId === user.id);
    // Same before/after-filter visibility as model-usage: an un-redeployed/global
    // pipe returns rows for everyone, which the client filter then drops to 0.
    log.info(
        "APP_GROWTH_PAID_SPEND: userId={userId} pipeRows={pipeRows} matchedRows={matchedRows}",
        {
            userId: user.id,
            pipeRows: rows.length,
            matchedRows: matched.length,
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

async function loadByopExternalAppOwner(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestUserRow[]> {
    const rows = await db.all<QuestUserRow>(
        sql`
        SELECT app_key.user_id AS userId
        FROM apikey AS user_key
        INNER JOIN apikey AS app_key
            ON app_key.id = user_key.byop_client_key_id
        WHERE app_key.user_id = ${user.id}
          AND user_key.user_id != app_key.user_id
        LIMIT 1`,
    );

    return uniqueUsers(rows);
}

function uniqueUsers(rows: QuestUserRow[]): QuestUserRow[] {
    return [...new Map(rows.map((row) => [row.userId, row])).values()];
}
