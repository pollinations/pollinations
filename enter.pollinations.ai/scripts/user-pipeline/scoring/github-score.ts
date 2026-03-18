/**
 * GitHub user validation for Seed tier eligibility.
 *
 * Points-based validation formula with quality filtering:
 *   - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
 *   - Commits (any repo): 0.1 pt each (max 2)
 *   - Public repos (quality only, diskUsage > 0): 0.5 pt each (max 1)
 *   - Stars (total across quality repos): 0.1 pt each (max 5)
 *   - Threshold: >= 8 pts
 *
 * Quality filtering: empty repos (diskUsage == 0) are excluded from repo count
 * and star totals.
 *
 * Risk assessment is tracked separately from the numeric score:
 *   - suspicious GitHub profile patterns do not change the score
 *   - they are exposed as risk_status / risk_flags for the orchestrators
 */

import {
    type AccountValidationResult,
    validateAccountRecords,
} from "../shared/github-account-validation.ts";
import { GITHUB_USERNAME_RE } from "../shared/github-identity.ts";
import { assessProfileRisk, type RiskResult } from "./github-risk.ts";

// Quality filtering: repos and stars are counted from quality repos only (diskUsage > 0).
// NOTE: If you update these values, also update enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx
const SCORING = [
    { field: "age_days", multiplier: 0.5 / 30, max: 6.0 }, // 0.5pt/month, max 6 (12 months)
    { field: "commits", multiplier: 0.1, max: 2.0 }, // 0.1pt each, max 2
    { field: "repos", multiplier: 0.5, max: 1.0 }, // 0.5pt each, max 1 (quality repos only)
    { field: "stars", multiplier: 0.1, max: 5.0 }, // 0.1pt each, max 5 (quality repos only)
] as const;
const THRESHOLD = 8.0;
const BATCH_SIZE = 50;
const MAX_WORKERS = 3;

interface RepoNode {
    stargazerCount: number;
    diskUsage: number;
    createdAt: string;
}

interface UserScoringData {
    login: string;
    createdAt: string;
    repositories: {
        totalCount: number;
        nodes: Array<RepoNode | null>;
    };
    contributionsCollection: {
        totalCommitContributions: number;
    };
}

export interface ScoredResult {
    username: string;
    github_id?: number | null;
    status: string;
    approved: boolean;
    reason: string;
    details: Record<string, number> | null;
    risk_status: string;
    risk_flags: string[];
    risk_details: RiskResult["risk_details"];
}

function buildScoringQuery(usernames: string[]): string {
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
    const fragments = usernames.map((username, i) => {
        const safe = username.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `
    u${i}: user(login: "${safe}") {
        login
        createdAt
        repositories(privacy: PUBLIC, isFork: false, first: 10, orderBy: {field: STARGAZERS, direction: DESC}) {
            totalCount
            nodes { stargazerCount diskUsage createdAt }
        }
        contributionsCollection(from: "${fromDate}") { totalCommitContributions }
    }`;
    });
    return `query { ${fragments.join("")} }`;
}

function scoreUser(
    data: UserScoringData | null,
    username: string,
): ScoredResult {
    if (!data) {
        return {
            username,
            status: "github_account_deleted",
            approved: false,
            reason: "GitHub account deleted",
            details: null,
            risk_status: "unavailable",
            risk_flags: [],
            risk_details: null,
        };
    }

    const created = new Date(data.createdAt);
    const ageDays = Math.floor(
        (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
    );

    const allNodes = (data.repositories.nodes ?? []).filter(
        (node): node is RepoNode => node !== null,
    );
    const qualityNodes = allNodes.filter((node) => (node.diskUsage ?? 0) > 0);

    const metrics: Record<string, number> = {
        age_days: ageDays,
        repos: qualityNodes.length,
        commits:
            data.contributionsCollection.totalCommitContributions,
        stars: qualityNodes.reduce(
            (sum, node) => sum + node.stargazerCount,
            0,
        ),
    };

    const scores: Record<string, number> = {};
    for (const config of SCORING) {
        const raw = metrics[config.field] * config.multiplier;
        scores[config.field] = Math.min(raw, config.max);
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const approved = totalScore >= THRESHOLD;

    const details: Record<string, number> = {
        age_days: ageDays,
        age_pts: scores.age_days,
        quality_repos: qualityNodes.length,
        total_repos: data.repositories.totalCount,
        total_fetched: allNodes.length,
        repos: metrics.repos,
        repos_pts: scores.repos,
        commits: metrics.commits,
        commits_pts: scores.commits,
        stars: metrics.stars,
        stars_pts: scores.stars,
        total: totalScore,
    };

    const risk = assessProfileRisk(data, username);

    return {
        username,
        status: "ok",
        approved,
        reason: `${totalScore.toFixed(1)} pts`,
        details,
        risk_status: risk.risk_status,
        risk_flags: risk.risk_flags,
        risk_details: risk.risk_details,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runGraphqlQuery(
    query: string,
    token: string,
    retries = 3,
): Promise<{ data: Record<string, unknown>; rateRemaining: number | null }> {
    let rateRemaining: number | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
        });

        rateRemaining = res.headers.has("x-ratelimit-remaining")
            ? Number.parseInt(
                  res.headers.get("x-ratelimit-remaining") as string,
                  10,
              )
            : null;

        if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            return { data, rateRemaining };
        }

        if (attempt < retries - 1 && [502, 503, 504].includes(res.status)) {
            await sleep(5000 * (attempt + 1));
            continue;
        }

        if (attempt < retries - 1 && [403, 429].includes(res.status)) {
            const retryAfter = res.headers.get("retry-after");
            const resetAt = res.headers.get("x-ratelimit-reset");
            let wait: number;
            if (retryAfter) {
                wait = (Number.parseInt(retryAfter, 10) + 1) * 1000;
            } else if (resetAt) {
                wait =
                    Math.max(
                        Number.parseInt(resetAt, 10) -
                            Math.floor(Date.now() / 1000),
                        0,
                    ) *
                        1000 +
                    1000;
            } else {
                wait = 60000;
            }
            console.log(
                `   ⏳ Rate limited (HTTP ${res.status}), waiting ${Math.ceil(wait / 1000)}s...`,
            );
            await sleep(wait);
            continue;
        }

        throw new Error(`GitHub GraphQL request failed with HTTP ${res.status}`);
    }

    throw new Error("GitHub GraphQL request failed without a response");
}

async function getGithubToken(): Promise<string> {
    // Dynamically import to reuse the same auth logic
    const mod = await import("../shared/github-account-validation.ts");
    // Trigger token initialization (validateAccountRecords initializes the token)
    // But we actually just need the env var — the shared module manages App auth
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        // Fall back: if App auth is configured, the shared module handles it.
        // For scoring, we do direct GraphQL, so we need the token.
        // Try to get it from the shared module by calling a small validation.
        throw new Error("GITHUB_TOKEN is required for scoring GraphQL queries");
    }
    return token;
}

async function fetchAndScoreBatch(
    usernames: string[],
    token: string,
): Promise<{ results: ScoredResult[]; rateRemaining: number | null }> {
    const { data, rateRemaining } = await runGraphqlQuery(
        buildScoringQuery(usernames),
        token,
    );

    const results = usernames.map((username, i) => {
        const userData = (data as Record<string, Record<string, unknown>>)
            .data?.[`u${i}`] as UserScoringData | null;
        return scoreUser(userData, username);
    });
    return { results, rateRemaining };
}

async function runConcurrent<T>(
    items: T[],
    maxWorkers: number,
    fn: (item: T) => Promise<void>,
): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: maxWorkers }, async () => {
        while (index < items.length) {
            const current = index++;
            await fn(items[current]);
        }
    });
    await Promise.all(workers);
}

async function scoreUsernames(usernames: string[]): Promise<ScoredResult[]> {
    if (usernames.length === 0) return [];

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error("GITHUB_TOKEN required for GitHub scoring");
    }

    const invalidResults = usernames
        .filter((u) => !GITHUB_USERNAME_RE.test(u))
        .map((u) => scoreUser(null, u));
    const validUsernames = usernames.filter((u) =>
        GITHUB_USERNAME_RE.test(u),
    );

    if (validUsernames.length === 0) return invalidResults;

    const batches: string[][] = [];
    for (let i = 0; i < validUsernames.length; i += BATCH_SIZE) {
        batches.push(validUsernames.slice(i, i + BATCH_SIZE));
    }

    const results = [...invalidResults];
    let completed = 0;
    let approvedCount = 0;

    await runConcurrent(batches, MAX_WORKERS, async (batch) => {
        const { results: batchResults, rateRemaining } =
            await fetchAndScoreBatch(batch, token);
        results.push(...batchResults);
        approvedCount += batchResults.filter((r) => r.approved).length;
        completed++;
        const approvalRate =
            results.length > 0
                ? ((100 * approvedCount) / results.length).toFixed(0)
                : "0";
        console.log(
            `   Validating: ${completed}/${batches.length} batches (seed: ${approvalRate}%, quota: ${rateRemaining ?? "?"})`,
        );

        if (rateRemaining !== null && rateRemaining <= 100) {
            await sleep(rateRemaining > 50 ? 1000 : 2000);
        } else if (rateRemaining === null) {
            await sleep(2000);
        }
    });

    return results;
}

export async function validateUserRecords(
    records: Array<Record<string, unknown>>,
): Promise<ScoredResult[]> {
    if (records.length === 0) return [];

    const accountResults = await validateAccountRecords(records);
    const scoreTargets = accountResults
        .filter(
            (r) =>
                r.status === "ok" && typeof r.username === "string",
        )
        .map((r) => r.username as string);

    const scoreResults = await scoreUsernames(scoreTargets);
    const scoreByUsername = new Map(
        scoreResults
            .filter((r) => typeof r.username === "string")
            .map((r) => [r.username, r]),
    );

    const merged: ScoredResult[] = [];
    for (const account of accountResults) {
        const { username, github_id } = account;
        if (account.status !== "ok" || typeof username !== "string") {
            const deleted = scoreUser(null, username ?? "");
            deleted.github_id = github_id;
            deleted.username = username ?? "";
            merged.push(deleted);
            continue;
        }

        const scored = scoreByUsername.get(username);
        if (!scored) {
            const unavailable = scoreUser(null, username);
            unavailable.github_id = github_id;
            merged.push(unavailable);
            continue;
        }

        merged.push({ ...scored, github_id });
    }

    return merged;
}
