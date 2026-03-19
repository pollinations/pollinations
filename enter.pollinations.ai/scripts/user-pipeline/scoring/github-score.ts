/**
 * GitHub activity scoring for the user pipeline.
 *
 * validateUserRecords is the main entry point: it checks account existence via
 * REST, then fetches activity data via GraphQL and scores each user on age,
 * quality repos, commits, and stars. A REST 404 is treated as deleted;
 * transient lookup failures are deferred as unavailable. A total >= 8 is
 * "approved". Also runs assessProfileRisk to flag suspicious repository
 * patterns.
 *
 * storeGithubScores persists scores to D1.
 */

import { executeD1 } from "../shared/d1.ts";
import {
    type GitHubRateLimit,
    githubGraphqlRequest,
    githubRestRequest,
} from "../shared/github.ts";
import {
    GITHUB_ACCOUNT_DELETED_REASON,
    PIPELINE_DB_BATCH_SIZE,
} from "../shared/github-identity.ts";
import { assessProfileRisk, type GitHubRiskResult } from "./github-risk.ts";

const GITHUB_REST_USER = "https://api.github.com/user";
const BATCH_SIZE = 20;
const ACCOUNT_LOOKUP_MAX_WORKERS = 3;
const GRAPHQL_MAX_WORKERS = 3;
const THRESHOLD = 8;

const SCORING = [
    { field: "age_days", multiplier: 0.5 / 30, max: 6 },
    { field: "commits", multiplier: 0.1, max: 2 },
    { field: "repos", multiplier: 0.5, max: 1 },
    { field: "stars", multiplier: 0.1, max: 5 },
] as const;

interface InputRecord {
    github_id?: number | null;
}

interface GitHubUserRestResponse {
    node_id?: string;
}

interface GitHubRepositoryNode {
    stargazerCount: number;
    diskUsage: number;
    createdAt: string;
}

interface GitHubGraphqlUser {
    __typename?: string;
    createdAt: string;
    repositories: {
        totalCount: number;
        nodes: Array<GitHubRepositoryNode | null>;
    };
    contributionsCollection: {
        totalCommitContributions: number;
    };
}

interface GitHubGraphqlResponse {
    data?: Record<string, GitHubGraphqlUser | { __typename?: string } | null>;
    errors?: Array<{
        message?: string;
        path?: Array<string | number>;
    }>;
}

export interface GitHubValidationAccount {
    github_id: number | null;
    node_id: string | null;
    status: "ok" | "unavailable" | typeof GITHUB_ACCOUNT_DELETED_REASON;
    reason?: string;
}

export interface GitHubScoreDetails {
    age_days: number;
    age_pts: number;
    quality_repos: number;
    total_repos: number;
    total_fetched: number;
    repos: number;
    repos_pts: number;
    commits: number;
    commits_pts: number;
    stars: number;
    stars_pts: number;
    total: number;
}

export interface GitHubValidationResult {
    github_id: number | null;
    status: "ok" | "unavailable" | typeof GITHUB_ACCOUNT_DELETED_REASON;
    approved: boolean;
    reason: string;
    details: GitHubScoreDetails | null;
    risk_status: GitHubRiskResult["risk_status"];
    risk_flags: string[];
    risk_details: GitHubRiskResult["risk_details"];
}

interface StoreScoresOptions {
    timestamp?: number;
    onBatchStored?: (stored: number, total: number) => void;
}

function parseGithubId(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        const parsed = Number.parseInt(value.trim(), 10);
        return parsed > 0 ? parsed : null;
    }
    return null;
}

function normalizeRecord(record: InputRecord): { github_id: number | null } {
    return {
        github_id: parseGithubId(record.github_id),
    };
}

export function buildQuery(accounts: Array<{ node_id: string }>): string {
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z")
        .replace(/T\d{2}:\d{2}:\d{2}Z$/, "T00:00:00Z");
    const fragments = accounts.map((account, index) => {
        const safeNodeId = account.node_id
            .replaceAll("\\", "\\\\")
            .replaceAll('"', '\\"');
        return `
    u${index}: node(id: "${safeNodeId}") {
        __typename
        ... on User {
            createdAt
            repositories(privacy: PUBLIC, isFork: false, first: 10, orderBy: {field: STARGAZERS, direction: DESC}) {
                totalCount
                nodes { stargazerCount diskUsage createdAt }
            }
            contributionsCollection(from: "${fromDate}") { totalCommitContributions }
        }
    }`;
    });
    return `query { ${fragments.join("")} }`;
}

export function scoreUser(
    data: GitHubGraphqlUser | null,
    githubId: number | null,
): GitHubValidationResult {
    if (!data) {
        return deletedUserResult(githubId);
    }

    const createdAt = new Date(data.createdAt);
    const ageDays = Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const allNodes = (data.repositories.nodes ?? []).filter(
        (node): node is GitHubRepositoryNode => Boolean(node),
    );
    const qualityNodes = allNodes.filter((node) => (node.diskUsage ?? 0) > 0);
    const metrics = {
        age_days: ageDays,
        repos: qualityNodes.length,
        commits: Number(
            data.contributionsCollection.totalCommitContributions ?? 0,
        ),
        stars: qualityNodes.reduce(
            (sum, node) => sum + Number(node.stargazerCount ?? 0),
            0,
        ),
    };

    const scores = {
        age_days: Math.min(
            metrics.age_days * SCORING[0].multiplier,
            SCORING[0].max,
        ),
        commits: Math.min(
            metrics.commits * SCORING[1].multiplier,
            SCORING[1].max,
        ),
        repos: Math.min(metrics.repos * SCORING[2].multiplier, SCORING[2].max),
        stars: Math.min(metrics.stars * SCORING[3].multiplier, SCORING[3].max),
    };
    const total =
        scores.age_days + scores.commits + scores.repos + scores.stars;
    const risk = assessProfileRisk(data, githubId);

    return {
        github_id: githubId,
        status: "ok",
        approved: total >= THRESHOLD,
        reason: `${total.toFixed(1)} pts`,
        details: {
            age_days: ageDays,
            age_pts: scores.age_days,
            quality_repos: qualityNodes.length,
            total_repos: Number(data.repositories.totalCount ?? 0),
            total_fetched: allNodes.length,
            repos: metrics.repos,
            repos_pts: scores.repos,
            commits: metrics.commits,
            commits_pts: scores.commits,
            stars: metrics.stars,
            stars_pts: scores.stars,
            total,
        },
        risk_status: risk.risk_status,
        risk_flags: risk.risk_flags,
        risk_details: risk.risk_details,
    };
}

function deletedUserResult(
    githubId: number | null,
    reason = "GitHub account deleted",
): GitHubValidationResult {
    return {
        github_id: githubId,
        status: GITHUB_ACCOUNT_DELETED_REASON,
        approved: false,
        reason,
        details: null,
        risk_status: "unavailable",
        risk_flags: [],
        risk_details: null,
    };
}

function unavailableUserResult(
    githubId: number | null,
    reason = "GitHub scoring unavailable",
): GitHubValidationResult {
    return {
        github_id: githubId,
        status: "unavailable",
        approved: false,
        reason,
        details: null,
        risk_status: "unavailable",
        risk_flags: [],
        risk_details: null,
    };
}

async function mapConcurrent<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function runWorker(): Promise<void> {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(items[index]);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
        runWorker(),
    );
    await Promise.all(workers);
    return results;
}

async function maybeThrottle(rateLimit: GitHubRateLimit): Promise<void> {
    if (rateLimit.remaining === null) {
        return;
    }
    if (rateLimit.remaining <= 50) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return;
    }
    if (rateLimit.remaining <= 100) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

async function fetchAccountById(
    githubId: number,
): Promise<GitHubValidationAccount> {
    const result = await githubRestRequest<GitHubUserRestResponse>(
        `${GITHUB_REST_USER}/${githubId}`,
        {
            userAgent: "pollinations-github-validator",
        },
    );
    await maybeThrottle(result);

    if (
        result.status === 200 &&
        result.data &&
        typeof result.data.node_id === "string" &&
        result.data.node_id
    ) {
        return {
            github_id: githubId,
            node_id: result.data.node_id,
            status: "ok",
        };
    }

    if (result.status === 404) {
        return {
            github_id: githubId,
            node_id: null,
            status: GITHUB_ACCOUNT_DELETED_REASON,
            reason: "GitHub account deleted",
        };
    }

    return {
        github_id: githubId,
        node_id: null,
        status: "unavailable",
        reason:
            result.status === 200
                ? "GitHub account lookup missing node_id"
                : `GitHub account lookup failed: HTTP ${result.status}`,
    };
}

export async function validateAccountRecords(
    records: InputRecord[],
): Promise<GitHubValidationAccount[]> {
    const normalized = records.map(normalizeRecord);
    const jobs = normalized.map((record) => record.github_id);

    return mapConcurrent(
        jobs,
        ACCOUNT_LOOKUP_MAX_WORKERS,
        async (githubId): Promise<GitHubValidationAccount> => {
            if (!githubId) {
                return {
                    github_id: null,
                    node_id: null,
                    status: "unavailable",
                    reason: "Missing GitHub ID",
                };
            }
            return fetchAccountById(githubId);
        },
    );
}

async function fetchBatch(
    accounts: GitHubValidationAccount[],
): Promise<GitHubValidationResult[]> {
    const { data, rateLimit } =
        await githubGraphqlRequest<GitHubGraphqlResponse>(
            buildQuery(
                accounts.flatMap((account) =>
                    account.node_id ? [{ node_id: account.node_id }] : [],
                ),
            ),
            {
                userAgent: "pollinations-github-validator",
            },
        );
    await maybeThrottle(rateLimit);

    const aliasErrors = collectAliasErrors(data.errors);
    const results = new Array<GitHubValidationResult>(accounts.length);
    const retryEntries: Array<{
        account: GitHubValidationAccount;
        index: number;
    }> = [];

    for (const [index, account] of accounts.entries()) {
        const errors = aliasErrors.get(index);
        if (errors) {
            retryEntries.push({ account, index });
            continue;
        }

        const nodeData = data.data?.[`u${index}`];
        const userData =
            nodeData &&
            typeof nodeData === "object" &&
            nodeData.__typename === "User"
                ? (nodeData as GitHubGraphqlUser)
                : null;
        if (userData) {
            results[index] = scoreUser(userData, account.github_id);
            continue;
        }

        results[index] = unavailableUserResult(
            account.github_id,
            "GitHub scoring unavailable",
        );
    }

    if (retryEntries.length === 0) {
        return results;
    }

    if (accounts.length === 1) {
        const onlyRetry = retryEntries[0];
        results[onlyRetry.index] = unavailableUserResult(
            onlyRetry.account.github_id,
            aliasErrors.get(onlyRetry.index)?.join("; ") ||
                "GitHub scoring unavailable",
        );
        return results;
    }

    const retryBatchSize = Math.max(1, Math.floor(accounts.length / 2));
    for (let index = 0; index < retryEntries.length; index += retryBatchSize) {
        const batch = retryEntries.slice(index, index + retryBatchSize);
        const retried = await fetchBatch(batch.map(({ account }) => account));
        for (const [offset, result] of retried.entries()) {
            results[batch[offset].index] = result;
        }
    }

    return results;
}

function collectAliasErrors(
    errors: GitHubGraphqlResponse["errors"],
): Map<number, string[]> {
    const aliasErrors = new Map<number, string[]>();

    for (const error of errors ?? []) {
        const alias = error.path?.[0];
        if (typeof alias !== "string") {
            continue;
        }
        const match = /^u(\d+)$/.exec(alias);
        if (!match) {
            continue;
        }
        const index = Number.parseInt(match[1], 10);
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }
        const existing = aliasErrors.get(index) ?? [];
        if (error.message && !existing.includes(error.message)) {
            existing.push(error.message);
        }
        aliasErrors.set(index, existing);
    }

    return aliasErrors;
}

export async function validateUserRecords(
    records: InputRecord[],
): Promise<GitHubValidationResult[]> {
    const accountResults = await validateAccountRecords(records);
    const results = new Array<GitHubValidationResult>(accountResults.length);
    const scoreJobs = accountResults.flatMap((account, index) =>
        account.status === "ok" && account.github_id && account.node_id
            ? [{ account, index }]
            : [],
    );

    for (const [index, accountResult] of accountResults.entries()) {
        if (accountResult.status === GITHUB_ACCOUNT_DELETED_REASON) {
            results[index] = deletedUserResult(
                accountResult.github_id,
                accountResult.reason,
            );
            continue;
        }

        if (
            accountResult.status !== "ok" ||
            !accountResult.github_id ||
            !accountResult.node_id
        ) {
            results[index] = unavailableUserResult(
                accountResult.github_id,
                accountResult.reason,
            );
        }
    }

    const batches = [];
    for (let index = 0; index < scoreJobs.length; index += BATCH_SIZE) {
        batches.push(scoreJobs.slice(index, index + BATCH_SIZE));
    }

    const batchResults = await mapConcurrent(
        batches,
        GRAPHQL_MAX_WORKERS,
        async (batch) => ({
            batch,
            scored: await fetchBatch(batch.map(({ account }) => account)),
        }),
    );

    for (const { batch, scored } of batchResults) {
        for (const [offset, result] of scored.entries()) {
            results[batch[offset].index] = result;
        }
    }

    return results;
}

export function isScorableValidationResult(
    result: GitHubValidationResult,
): boolean {
    return (
        result.status === "ok" &&
        Number.isInteger(result.github_id) &&
        (result.github_id ?? 0) > 0
    );
}

export function extractDeletedGithubIds(
    results: Array<{ github_id: number | null; status: string }>,
): number[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === GITHUB_ACCOUNT_DELETED_REASON &&
                Number.isInteger(result.github_id) &&
                result.github_id > 0
                    ? [result.github_id]
                    : [],
            ),
        ),
    );
}

export function storeGithubScores(
    env: "staging" | "production",
    tier: "microbe" | "spore",
    results: GitHubValidationResult[],
    options: StoreScoresOptions = {},
): number {
    const timestamp = options.timestamp ?? Date.now();
    let stored = 0;

    for (
        let index = 0;
        index < results.length;
        index += PIPELINE_DB_BATCH_SIZE
    ) {
        const batch = results
            .slice(index, index + PIPELINE_DB_BATCH_SIZE)
            .flatMap((result) => {
                const githubId = result.github_id;
                if (!Number.isInteger(githubId) || githubId <= 0) {
                    return [];
                }

                const rawScore = Number(result.details?.total ?? 0);
                return [
                    {
                        githubId,
                        totalScore: Number.isFinite(rawScore) ? rawScore : 0,
                    },
                ];
            });
        if (batch.length === 0) continue;

        const scoreCases = batch
            .map(
                ({ githubId, totalScore }) =>
                    `WHEN ${githubId} THEN ${totalScore}`,
            )
            .join(" ");
        const idList = batch.map(({ githubId }) => githubId).join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET score = CASE github_id ${scoreCases} END, score_checked_at = ${timestamp} WHERE github_id IN (${idList}) AND tier = '${tier}'`,
        );
        if (!ok) continue;

        stored += batch.length;
        options.onBatchStored?.(stored, results.length);
    }

    return stored;
}
