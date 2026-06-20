import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGitHubQuestGrantKey,
    buildGrantKey,
    COMMUNITY_GITHUB_QUEST_ID,
    GITHUB_QUEST_GRANT_SOURCE,
    type GrantCandidate,
    PRODUCT_QUEST_GRANT_SOURCE,
    type QuestDefinition,
    questUserKeyPrefix,
    requireQuestDefinition,
} from "@shared/quests/definitions.ts";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { fetchTinybirdRows, requireTinybirdReadToken } from "./tinybird.ts";

const log = getLogger(["enter", "quest-evaluator"]);
const MAX_GRANTS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FIRST_API_KEY_QUEST = requireQuestDefinition("onboarding:first_api_key");
const FIRST_TOP_UP_QUEST = requireQuestDefinition("spend:first_top_up");
const ESTABLISHED_GITHUB_ACCOUNT_QUEST = requireQuestDefinition(
    "onboarding:established_github_account",
);
const LIST_APP_QUEST = requireQuestDefinition("grow:list_app_on_pollinations");
const COMMUNITY_GITHUB_QUEST = requireQuestDefinition(
    COMMUNITY_GITHUB_QUEST_ID,
);
const FIRST_API_KEY_USER_KEY_PREFIX = questUserKeyPrefix(FIRST_API_KEY_QUEST);
const FIRST_TOP_UP_USER_KEY_PREFIX = questUserKeyPrefix(FIRST_TOP_UP_QUEST);
const ESTABLISHED_GITHUB_ACCOUNT_USER_KEY_PREFIX = questUserKeyPrefix(
    ESTABLISHED_GITHUB_ACCOUNT_QUEST,
);

type QuestEvaluatorResult = {
    questId: string;
    scanned: number;
    granted: number;
};

type GitHubAccountCandidateRow = {
    userId: string;
    githubId: number;
    githubUsername: string | null;
};

type AppDirectoryQuestRow = {
    name: string;
    web_url: string;
    github_user_id: string;
    github_username: string;
    issue_url: string;
    approved_date: string;
};

type CompletedGitHubQuestIssueRow = {
    userId: string;
    githubUsername: string | null;
    issueNumber: number;
    title: string;
    url: string;
    rewardAmount: number;
    balanceBucket: "pack" | "tier";
    assigneeGithubId: number;
    assigneeLogin: string | null;
    completedByPrNumber: number;
};

export function buildQuestGrantMetadata(
    definition: QuestDefinition,
    candidate: GrantCandidate,
): Record<string, unknown> {
    return {
        ...(candidate.metadata ?? {}),
        title: definition.title,
    };
}

export async function grantQuestCandidates({
    db,
    questId,
    candidates,
}: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    questId: string;
    candidates: GrantCandidate[];
}): Promise<QuestEvaluatorResult> {
    const definition = requireQuestDefinition(questId);

    let granted = 0;
    for (const candidate of candidates) {
        const result = await grantReward(db, {
            idempotencyKey: buildGrantKey(definition, candidate),
            userId: candidate.userId,
            source: candidate.source ?? PRODUCT_QUEST_GRANT_SOURCE,
            questId,
            amount: candidate.amount ?? definition.rewardAmount,
            bucket: candidate.bucket ?? definition.balanceBucket,
            sourceRef: candidate.sourceRef,
            metadata: buildQuestGrantMetadata(definition, candidate),
        });
        if (result.granted) granted += 1;
    }

    return {
        questId,
        scanned: candidates.length,
        granted,
    };
}

async function findFirstApiKeyCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<GrantCandidate[]> {
    return await db.all<GrantCandidate>(
        sql`
        SELECT
            apikey.user_id AS userId,
            MIN(apikey.id) AS sourceRef
        FROM apikey
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${FIRST_API_KEY_USER_KEY_PREFIX} || apikey.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY apikey.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );
}

async function findFirstTopUpCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<GrantCandidate[]> {
    return await db.all<GrantCandidate>(
        sql`
        SELECT
            stripe_checkout_credits.user_id AS userId,
            MIN(stripe_checkout_credits.session_id) AS sourceRef
        FROM stripe_checkout_credits
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${FIRST_TOP_UP_USER_KEY_PREFIX} || stripe_checkout_credits.user_id
        WHERE reward_grants.id IS NULL
        GROUP BY stripe_checkout_credits.user_id
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );
}

function githubApiHeaders(env: CloudflareBindings): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "pollinations-enter",
    };
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        headers.Authorization = `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`;
    }
    return headers;
}

async function fetchGitHubAccountCreatedAt(
    env: CloudflareBindings,
    githubId: number,
): Promise<Date | null> {
    const response = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: githubApiHeaders(env),
    });
    if (!response.ok) {
        log.warn(
            "GITHUB_ACCOUNT_AGE_PROFILE_FETCH_FAILED: githubId={githubId} status={status}",
            {
                githubId,
                status: response.status,
            },
        );
        return null;
    }

    const profile = (await response.json()) as { created_at?: string };
    if (!profile.created_at) return null;
    const createdAt = new Date(profile.created_at);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

async function findEstablishedGitHubAccountCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
    env: CloudflareBindings,
    now = new Date(),
): Promise<GrantCandidate[]> {
    const rows = await db.all<GitHubAccountCandidateRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_id AS githubId,
            user.github_username AS githubUsername
        FROM user
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${ESTABLISHED_GITHUB_ACCOUNT_USER_KEY_PREFIX} || user.id
        WHERE user.github_id IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    const candidates: GrantCandidate[] = [];
    for (const row of rows) {
        const createdAt = await fetchGitHubAccountCreatedAt(env, row.githubId);
        if (!createdAt) continue;

        const accountAgeDays = Math.floor(
            (now.getTime() - createdAt.getTime()) / MS_PER_DAY,
        );
        if (accountAgeDays < GITHUB_ACCOUNT_AGE_DAYS) continue;

        candidates.push({
            userId: row.userId,
            sourceRef: `github:${row.githubId}`,
            metadata: {
                githubId: row.githubId,
                githubUsername: row.githubUsername,
                githubAccountCreatedAt: createdAt.toISOString(),
                githubAccountAgeDays: accountAgeDays,
                thresholdDays: GITHUB_ACCOUNT_AGE_DAYS,
            },
        });
    }

    return candidates;
}

async function findApprovedAppCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
    env: CloudflareBindings,
): Promise<GrantCandidate[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const apps = await fetchTinybirdRows<AppDirectoryQuestRow>(
        tinybirdOrigin,
        "/v0/pipes/app_directory_public.json",
        tinybirdToken,
        {},
    );
    const githubIds = [
        ...new Set(
            apps
                .map((app) => Number(app.github_user_id))
                .filter((githubId) => Number.isInteger(githubId)),
        ),
    ];
    if (!githubIds.length) return [];

    const users = await db
        .select({
            userId: schema.user.id,
            githubId: schema.user.githubId,
            githubUsername: schema.user.githubUsername,
        })
        .from(schema.user)
        .where(inArray(schema.user.githubId, githubIds));
    const userByGithubId = new Map(users.map((user) => [user.githubId, user]));

    return apps.flatMap((app) => {
        const githubId = Number(app.github_user_id);
        const user = userByGithubId.get(githubId);
        if (!user || !app.issue_url) return [];

        return [
            {
                userId: user.userId,
                eventId: `app:${app.issue_url}`,
                sourceRef: app.issue_url,
                metadata: {
                    appName: app.name,
                    appUrl: app.web_url,
                    issueUrl: app.issue_url,
                    approvedDate: app.approved_date,
                    githubId,
                    githubUsername: user.githubUsername ?? app.github_username,
                },
            },
        ];
    });
}

async function findCompletedGitHubIssueCandidates(
    db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<GrantCandidate[]> {
    const rows = await db.all<CompletedGitHubQuestIssueRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_username AS githubUsername,
            github_quest_issues.issue_number AS issueNumber,
            github_quest_issues.title AS title,
            github_quest_issues.url AS url,
            github_quest_issues.reward_amount AS rewardAmount,
            github_quest_issues.balance_bucket AS balanceBucket,
            github_quest_issues.assignee_github_id AS assigneeGithubId,
            github_quest_issues.assignee_login AS assigneeLogin,
            github_quest_issues.completed_by_pr_number AS completedByPrNumber
        FROM github_quest_issues
        INNER JOIN user
            ON user.github_id = github_quest_issues.assignee_github_id
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${"quest:"} ||
                github_quest_issues.issue_number ||
                ${":gh:"} ||
                github_quest_issues.assignee_github_id ||
                ${":role:assignee"}
        WHERE github_quest_issues.quest_id = ${COMMUNITY_GITHUB_QUEST_ID}
            AND github_quest_issues.state = 'completed'
            AND github_quest_issues.reward_amount > 0
            AND github_quest_issues.completed_by_pr_number IS NOT NULL
            AND github_quest_issues.assignee_github_id IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        userId: row.userId,
        idempotencyKey: buildGitHubQuestGrantKey({
            issueNumber: row.issueNumber,
            githubId: row.assigneeGithubId,
        }),
        eventId: `issue:${row.issueNumber}`,
        source: GITHUB_QUEST_GRANT_SOURCE,
        amount: row.rewardAmount,
        bucket: row.balanceBucket,
        sourceRef: `pr:${row.completedByPrNumber}`,
        metadata: {
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
            issueNumber: row.issueNumber,
            issueTitle: row.title,
            issueUrl: row.url,
            prNumber: row.completedByPrNumber,
            role: "assignee",
            githubUsername: row.githubUsername ?? row.assigneeLogin,
        },
    }));
}

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: true; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const results = [
        await grantQuestCandidates({
            db,
            questId: FIRST_API_KEY_QUEST.id,
            candidates: await findFirstApiKeyCandidates(db),
        }),
        await grantQuestCandidates({
            db,
            questId: FIRST_TOP_UP_QUEST.id,
            candidates: await findFirstTopUpCandidates(db),
        }),
        await grantQuestCandidates({
            db,
            questId: ESTABLISHED_GITHUB_ACCOUNT_QUEST.id,
            candidates: await findEstablishedGitHubAccountCandidates(db, env),
        }),
        await grantQuestCandidates({
            db,
            questId: COMMUNITY_GITHUB_QUEST.id,
            candidates: await findCompletedGitHubIssueCandidates(db),
        }),
        await grantQuestCandidates({
            db,
            questId: LIST_APP_QUEST.id,
            candidates: await findApprovedAppCandidates(db, env),
        }),
    ];

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return { success: true, results };
}
