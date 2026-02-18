#!/usr/bin/env npx tsx
/**
 * Unified Tier Upgrade Script
 *
 * Processes all tier transitions defined in TIER_UPGRADES (tier-config.ts):
 *   microbe  → spore  (legitimacy score + account age + avg daily pollen spend 7d)
 *   microbe/spore → seed  (age + commits + repos + stars + spend)
 *   seed     → flower (all GitHub signals + higher spend)
 *
 * Data sources:
 *   - D1 (wrangler)         : user list, current tier, user_id
 *   - GitHub GraphQL        : age, commits, repos, stars
 *   - Tinybird /v0/sql      : avg_daily_spend_7d (one bulk query, joined by user_id)
 *   - LLM scorer (llm-scorer.ts) : legitimacy / trust_score, contributes points
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/score-for-upgrade.ts upgrade --dry-run --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --env production --verbose
 *   npx tsx scripts/score-for-upgrade.ts upgrade --to spore --dry-run
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import { TIER_UPGRADES, type TierName } from "../src/tier-config.ts";
import { scoreUsers as runLLMScorer } from "./llm-scorer.ts";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const BATCH_SIZE = 50;
const MAX_USERS_PER_RUN = 8000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Token helpers ───────────────────────────────────────────────────────

function getGithubToken(): string {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error("GITHUB_TOKEN environment variable required");
        process.exit(1);
    }
    return token;
}

function getTinybirdToken(): string {
    // 1. Explicit env var
    if (process.env.TINYBIRD_READ_TOKEN) return process.env.TINYBIRD_READ_TOKEN;
    // 2. Decrypted .dev.vars file (present after `npm run decrypt-vars`)
    const devVars = ".dev.vars";
    if (existsSync(devVars)) {
        const content = readFileSync(devVars, "utf-8");
        const match = content.match(/TINYBIRD_READ_TOKEN=([^\n]+)/);
        if (match) return match[1].trim();
    }
    console.error(
        "TINYBIRD_READ_TOKEN not found. Run `npm run decrypt-vars` or set the env var.",
    );
    process.exit(1);
}

// ── D1 helpers ──────────────────────────────────────────────────────────

type Environment = "staging" | "production";

interface D1User {
    id: string;
    github_username: string;
    tier: string;
}

function queryD1(
    query: string,
    env: Environment,
): Array<Record<string, unknown>> {
    const sanitized = query.replace(/\n/g, " ").replace(/"/g, '\\"');
    try {
        const result = execSync(
            `npx wrangler d1 execute DB --remote --env ${env} --json --command "${sanitized}"`,
            {
                encoding: "utf-8",
                maxBuffer: 100 * 1024 * 1024,
                timeout: 60_000,
            },
        );
        const data = JSON.parse(result);
        return data[0]?.results || [];
    } catch (error) {
        console.error(
            "D1 query failed:",
            error instanceof Error ? error.message : error,
        );
        return [];
    }
}

/** Fetch users eligible for a given tier transition, with day-slice strategy */
function fetchEligibleUsers(
    fromTiers: TierName[],
    env: Environment,
): { newUsers: D1User[]; sliceUsers: D1User[]; totalOld: number } {
    const tierList = fromTiers.map((t) => `'${t}'`).join(", ");
    const weekday = new Date().getUTCDay();
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    const newRows = queryD1(
        `SELECT id, github_username, tier FROM user
     WHERE tier IN (${tierList})
     AND github_username IS NOT NULL
     AND created_at > ${yesterday}`,
        env,
    );

    const countRows = queryD1(
        `SELECT COUNT(*) as count FROM user
     WHERE tier IN (${tierList})
     AND github_username IS NOT NULL
     AND created_at <= ${yesterday}`,
        env,
    );
    const totalOld = (countRows[0]?.count as number) || 0;

    const sliceSize = Math.ceil(totalOld / 7);
    const offset = weekday * sliceSize;

    const sliceRows = queryD1(
        `SELECT id, github_username, tier FROM user
     WHERE tier IN (${tierList})
     AND github_username IS NOT NULL
     AND created_at <= ${yesterday}
     ORDER BY created_at ASC
     LIMIT ${sliceSize} OFFSET ${offset}`,
        env,
    );

    return {
        newUsers: newRows as D1User[],
        sliceUsers: sliceRows as D1User[],
        totalOld,
    };
}

// ── Tinybird spend ──────────────────────────────────────────────────────

/** Fetch avg daily pollen spend over the last 7 days for ALL users in one query. */
async function fetchSpendByUserId(): Promise<Map<string, number>> {
    const token = getTinybirdToken();
    const sql = `
    SELECT
      user_id,
      sum(total_price) / 7 AS avg_daily_spend_7d
    FROM generation_event
    WHERE start_time >= now() - INTERVAL 7 DAY
      AND environment = 'production'
      AND user_id != ''
      AND user_id != 'undefined'
    GROUP BY user_id
  `
        .trim()
        .replace(/\n\s+/g, " ");

    const url = `${TINYBIRD_BASE}/v0/sql?q=${encodeURIComponent(sql)}`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            const text = await response.text();
            console.warn(`Tinybird query failed (${response.status}): ${text}`);
            return new Map();
        }
        const json = (await response.json()) as {
            data: Array<{ user_id: string; avg_daily_spend_7d: number }>;
        };
        return new Map(
            json.data.map((row) => [row.user_id, row.avg_daily_spend_7d]),
        );
    } catch (err) {
        console.warn("Tinybird fetch error:", err);
        return new Map();
    }
}

// ── GitHub GraphQL ──────────────────────────────────────────────────────

interface GitHubMetrics {
    age_days: number;
    repos: number;
    commits: number;
    stars: number;
}

interface GitHubGraphQLUser {
    createdAt: string;
    repositories: {
        totalCount: number;
        nodes: Array<{ stargazerCount: number } | null>;
    };
    contributionsCollection: {
        totalCommitContributions: number;
    };
}

function buildGraphQLQuery(usernames: string[]): string {
    const fragments = usernames.map((u, i) => {
        const safe = u.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `u${i}: user(login: "${safe}") {
      login createdAt
      repositories(privacy: PUBLIC, isFork: false, first: 5, orderBy: {field: STARGAZERS, direction: DESC}) {
        totalCount nodes { stargazerCount }
      }
      contributionsCollection { totalCommitContributions }
    }`;
    });
    return `query { ${fragments.join("\n")} }`;
}

function parseGitHubUser(data: GitHubGraphQLUser | null): GitHubMetrics | null {
    if (!data) return null;
    const age_days = Math.floor(
        (Date.now() - new Date(data.createdAt).getTime()) / 86400000,
    );
    const repos = data.repositories?.totalCount || 0;
    const commits = data.contributionsCollection?.totalCommitContributions || 0;
    const stars = (data.repositories?.nodes || []).reduce(
        (sum, node) => sum + (node?.stargazerCount || 0),
        0,
    );
    return { age_days, repos, commits, stars };
}

async function fetchGitHubBatch(
    usernames: string[],
    token: string,
    retries = 3,
): Promise<Map<string, GitHubMetrics>> {
    const query = buildGraphQLQuery(usernames);
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(GITHUB_GRAPHQL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query }),
            });

            if (response.status === 403 || response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                const resetAt = response.headers.get("X-RateLimit-Reset");
                let wait = 60;
                if (retryAfter) wait = parseInt(retryAfter, 10) + 1;
                else if (resetAt)
                    wait =
                        Math.max(
                            parseInt(resetAt, 10) -
                                Math.floor(Date.now() / 1000),
                            0,
                        ) + 1;
                console.log(`  Rate limited, waiting ${wait}s...`);
                await new Promise((r) => setTimeout(r, wait * 1000));
                continue;
            }

            if (!response.ok && attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                continue;
            }

            const json = await response.json();
            const results = (json?.data || {}) as Record<
                string,
                GitHubGraphQLUser | null
            >;
            const map = new Map<string, GitHubMetrics>();
            for (let i = 0; i < usernames.length; i++) {
                const metrics = parseGitHubUser(results[`u${i}`] ?? null);
                if (metrics) map.set(usernames[i], metrics);
            }
            return map;
        } catch {
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
            }
        }
    }
    return new Map();
}

async function fetchGitHubMetrics(
    usernames: string[],
): Promise<Map<string, GitHubMetrics>> {
    if (usernames.length === 0) return new Map();
    const token = getGithubToken();
    const result = new Map<string, GitHubMetrics>();

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        const batchResult = await fetchGitHubBatch(batch, token);
        for (const [k, v] of batchResult) result.set(k, v);

        const progress = Math.min(i + BATCH_SIZE, usernames.length);
        console.log(`  GitHub: ${progress}/${usernames.length} fetched`);

        if (i + BATCH_SIZE < usernames.length) {
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    return result;
}

// ── Scoring ─────────────────────────────────────────────────────────────

interface ScoreResult {
    userId: string;
    username: string;
    approved: boolean;
    reason: string;
    scores: Record<string, number>;
    total: number;
}

function scoreUser(
    user: D1User,
    githubMetrics: GitHubMetrics | null,
    avgDailySpend: number,
    trustScore: number,
    ruleIndex: number,
): ScoreResult {
    const rule = TIER_UPGRADES[ruleIndex];
    const rawMetrics: Record<string, number> = {
        ...(githubMetrics ?? { age_days: 0, repos: 0, commits: 0, stars: 0 }),
        avg_daily_spend_7d: avgDailySpend,
        trust_score: trustScore,
    };

    const scores: Record<string, number> = {};
    let needsGitHub = false;

    for (const crit of rule.criteria) {
        if (crit.source === "github") needsGitHub = true;
        const raw = (rawMetrics[crit.field] ?? 0) * crit.multiplier;
        scores[crit.field] = Math.min(raw, crit.max);
    }

    // If GitHub data required but unavailable, reject
    if (needsGitHub && !githubMetrics) {
        return {
            userId: user.id,
            username: user.github_username,
            approved: false,
            reason: "GitHub profile not found",
            scores,
            total: 0,
        };
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    return {
        userId: user.id,
        username: user.github_username,
        approved: total >= rule.threshold,
        reason: `${total.toFixed(1)} pts`,
        scores,
        total,
    };
}

// ── Apply upgrade ───────────────────────────────────────────────────────

function applyUpgrade(
    username: string,
    toTier: TierName,
    env: Environment,
): boolean {
    try {
        const result = execSync(
            `npx tsx scripts/tier-update-user.ts update-tier --githubUsername "${username}" --tier ${toTier} --env ${env}`,
            {
                encoding: "utf-8",
                cwd: process.cwd(),
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 120_000,
            },
        );
        if (result.includes("SKIP_UPGRADE=true")) {
            console.log(`  ${username}: already at higher tier`);
        } else {
            console.log(`  ${username}: → ${toTier}`);
        }
        return true;
    } catch (error) {
        console.error(
            `  ${username}: upgrade failed -`,
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

// ── LLM legitimacy scores ────────────────────────────────────────────────

function buildAbusePrompt(csvRows: string[]): string {
    return `Detect coordinated abuse by analyzing PATTERNS ACROSS MULTIPLE USERS. Score 0-100.

FOCUS: Cross-user patterns are the strongest signals. Look for:
- Common prefixes/suffixes shared by multiple users
- Similar username structures
- Same email domain clusters (especially obscure domains)
- Burst registrations within same time window

SIGNALS (use these codes):
cluster=3+ users share pattern (+50) - HIGHEST PRIORITY
burst=5+ registrations close together (+40)
rand=random/gibberish email username (+10)
disp=disposable/temp email domain (+20)

Output CSV: github,score,signals
moxailoo,100,cluster+burst+rand
johnsmith,0,
tempuser,20,disp

Data (github,email,registered,upgraded):
${csvRows.join("\n")}`;
}

/**
 * Run LLM scorer and return legitimacy scores per github username.
 * Legitimate accounts get ≈ 100, suspicious ones get low/zero.
 */
async function fetchLLMTrustScores(
    users: D1User[],
): Promise<Map<string, number>> {
    const usernameList = users.map((u) => `'${u.github_username}'`).join(", ");
    const userQuery = `SELECT email, github_username, created_at, tier FROM user WHERE github_username IN (${usernameList})`;

    const scored = await runLLMScorer({
        name: "upgrade-trust",
        userQuery,
        buildPrompt: buildAbusePrompt,
        chunkSize: 100,
        model: "gemini",
        parallelism: 2,
    });

    const trustScores = new Map<string, number>();
    for (const u of scored) {
        if (u.github_username) {
            trustScores.set(u.github_username, 100 - u.score);
        }
    }
    return trustScores;
}

// ── CLI ─────────────────────────────────────────────────────────────────

const upgradeCommand = command({
    name: "upgrade",
    desc: "Run tier upgrades for all transitions (or a specific target tier)",
    options: {
        env: string().enum("staging", "production").default("production"),
        to: string()
            .optional()
            .desc(
                "Only run the transition that targets this tier (e.g. spore, seed)",
            ),
        dryRun: boolean().default(false).desc("Validate only, no upgrades"),
        verbose: boolean()
            .default(false)
            .desc("Show per-user score breakdowns"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const weekday = new Date().getUTCDay();

        const rules = opts.to
            ? TIER_UPGRADES.filter((r) => r.to === opts.to)
            : TIER_UPGRADES;

        if (rules.length === 0) {
            console.error(`No upgrade rule found for --to ${opts.to}`);
            process.exit(1);
        }

        // Pre-fetch Tinybird spend once (covers all active rules)
        const needsTinybird = rules.some((r) =>
            r.criteria.some((c) => c.source === "tinybird"),
        );
        let spendByUserId = new Map<string, number>();
        if (needsTinybird) {
            console.log("Fetching 7-day avg pollen spend from Tinybird...");
            spendByUserId = await fetchSpendByUserId();
            console.log(`  Got spend data for ${spendByUserId.size} users\n`);
        }

        let totalSuccess = 0;
        let totalFailed = 0;

        for (const rule of rules) {
            const ruleIndex = TIER_UPGRADES.indexOf(rule);
            console.log(
                `${"=".repeat(55)}\n${rule.from.join("/")} → ${rule.to} (threshold: ${rule.threshold} pts)`,
            );
            console.log(
                `Environment: ${env} | Mode: ${opts.dryRun ? "DRY RUN" : "LIVE"} | Day: ${DAY_NAMES[weekday]}`,
            );

            // Fetch eligible users from D1
            const { newUsers, sliceUsers, totalOld } = fetchEligibleUsers(
                rule.from,
                env,
            );
            console.log(
                `  New (last 24h): ${newUsers.length} | Slice (1/7): ${sliceUsers.length} of ${totalOld}`,
            );

            let users = [...newUsers, ...sliceUsers];
            if (users.length > MAX_USERS_PER_RUN) {
                users = users.slice(0, MAX_USERS_PER_RUN);
                console.log(`  Capped at ${MAX_USERS_PER_RUN}`);
            }
            if (users.length === 0) {
                console.log("  No eligible users\n");
                continue;
            }

            // Fetch LLM trust scores if any criterion uses it
            const needsLLM = rule.criteria.some((c) => c.source === "llm");
            let llmTrustScores = new Map<string, number>();
            if (needsLLM) {
                console.log(
                    `  Running legitimacy scorer on ${users.length} users...`,
                );
                llmTrustScores = await fetchLLMTrustScores(users);
                console.log(
                    `  Got legitimacy scores for ${llmTrustScores.size} users`,
                );
            }

            // Fetch GitHub metrics if any criterion uses it
            const needsGitHub = rule.criteria.some(
                (c) => c.source === "github",
            );
            let githubMetrics = new Map<string, GitHubMetrics>();
            if (needsGitHub) {
                console.log(
                    `  Fetching GitHub data for ${users.length} users...`,
                );
                githubMetrics = await fetchGitHubMetrics(
                    users.map((u) => u.github_username),
                );
            }

            // Score all users
            const results: ScoreResult[] = users.map((user) =>
                scoreUser(
                    user,
                    githubMetrics.get(user.github_username) ?? null,
                    spendByUserId.get(user.id) ?? 0,
                    llmTrustScores.get(user.github_username) ?? 100,
                    ruleIndex,
                ),
            );

            const approved = results.filter((r) => r.approved);
            const rejected = results.filter((r) => !r.approved);
            console.log(
                `\n  Scored: ${results.length} | Approved: ${approved.length} | Rejected: ${rejected.length}`,
            );

            if (opts.verbose) {
                const criteriaFields = rule.criteria.map((c) => c.field);
                const header = [
                    "Username".padEnd(25),
                    ...criteriaFields.map((f) => f.padEnd(10)),
                    "Total",
                ];
                console.log(`\n  ${header.join(" ")}`);
                const separator = [
                    "-".repeat(25),
                    ...criteriaFields.map(() => "-".repeat(10)),
                    "-----",
                ].join(" ");
                console.log(`  ${separator}`);
                for (const r of results.slice(0, 20)) {
                    const cols = [
                        r.username.padEnd(25),
                        ...criteriaFields.map((f) =>
                            (r.scores[f] ?? 0).toFixed(1).padStart(10),
                        ),
                        `${r.approved ? "+" : "-"}${r.total.toFixed(1)}`,
                    ];
                    console.log(`  ${cols.join(" ")}`);
                }
                if (results.length > 20)
                    console.log(`  ... and ${results.length - 20} more`);
            }

            if (rejected.length > 0 && opts.verbose) {
                console.log("\n  Sample rejected:");
                for (const r of rejected.slice(0, 5)) {
                    console.log(`    ${r.username}: ${r.reason}`);
                }
            }

            if (approved.length === 0 || opts.dryRun) {
                if (opts.dryRun && approved.length > 0) {
                    console.log(
                        `\n  [DRY RUN] Would upgrade ${approved.length}:`,
                    );
                    for (const r of approved.slice(0, 10)) {
                        console.log(`    ${r.username} (${r.reason})`);
                    }
                    if (approved.length > 10)
                        console.log(`    ... and ${approved.length - 10} more`);
                }
                console.log();
                continue;
            }

            console.log(
                `\n  Upgrading ${approved.length} users to ${rule.to}...`,
            );
            let success = 0;
            let failed = 0;
            for (const r of approved) {
                if (applyUpgrade(r.username, rule.to, env)) success++;
                else failed++;
            }
            console.log(`  Done: ${success} upgraded, ${failed} failed\n`);
            totalSuccess += success;
            totalFailed += failed;
        }

        console.log("=".repeat(55));
        console.log(`Total: ${totalSuccess} upgraded, ${totalFailed} failed`);
        if (totalFailed > 0) process.exit(1);
    },
});

run([upgradeCommand]);
