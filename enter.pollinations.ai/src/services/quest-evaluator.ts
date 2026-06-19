import { getLogger } from "@logtape/logtape";
import { grantReward } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGrantKey,
    type GrantCandidate,
    getQuestDefinition,
    type QuestDefinition,
} from "@shared/quests/definitions.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const log = getLogger(["enter", "quest-evaluator"]);
const MAX_GRANTS_PER_RUN = 500;
const GITHUB_ACCOUNT_AGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRODUCT_QUEST_SOURCE = "product_quest";

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

export function buildQuestGrantMetadata(
    definition: QuestDefinition,
    candidate: GrantCandidate,
): Record<string, unknown> {
    return {
        ...(candidate.metadata ?? {}),
        title: definition.title,
        category: definition.category,
        eventType: definition.eventType,
    };
}

async function grantCandidates({
    db,
    questId,
    candidates,
}: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    questId: string;
    candidates: GrantCandidate[];
}): Promise<QuestEvaluatorResult> {
    const definition = getQuestDefinition(questId);
    if (!definition) {
        throw new Error(`Unknown quest definition: ${questId}`);
    }

    let granted = 0;
    for (const candidate of candidates) {
        const result = await grantReward(db, {
            idempotencyKey: buildGrantKey(definition, candidate),
            userId: candidate.userId,
            source: PRODUCT_QUEST_SOURCE,
            questId,
            amount: definition.rewardAmount,
            bucket: definition.balanceBucket,
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
                'quest:onboarding:first_api_key:user:' || apikey.user_id
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
                'quest:spend:first_top_up:user:' ||
                stripe_checkout_credits.user_id
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
                'quest:onboarding:established_github_account:user:' ||
                user.id
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

export async function runQuestEvaluator(
    env: CloudflareBindings,
): Promise<{ success: true; results: QuestEvaluatorResult[] }> {
    const db = drizzle(env.DB, { schema });
    const results = [
        await grantCandidates({
            db,
            questId: "onboarding:first_api_key",
            candidates: await findFirstApiKeyCandidates(db),
        }),
        await grantCandidates({
            db,
            questId: "spend:first_top_up",
            candidates: await findFirstTopUpCandidates(db),
        }),
        await grantCandidates({
            db,
            questId: "onboarding:established_github_account",
            candidates: await findEstablishedGitHubAccountCandidates(db, env),
        }),
    ];

    log.info("QUEST_EVALUATOR_COMPLETE: results={results}", { results });
    return { success: true, results };
}
