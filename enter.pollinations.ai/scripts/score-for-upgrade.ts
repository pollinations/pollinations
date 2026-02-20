#!/usr/bin/env npx tsx
/**
 * Unified Tier Upgrade Script
 *
 * Computes a single score per user from all SCORING_CRITERIA, then
 * upgrades them to the highest tier whose threshold they meet.
 *
 * Data sources:
 *   - D1 (wrangler)         : user list, current tier, user_id
 *   - GitHub GraphQL        : age, commits, repos, stars
 *   - Tinybird /v0/sql      : avg_daily_spend_7d (one bulk query, joined by user_id)
 *   - LLM scorer            : trust_score (100 - abuse_score)
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/score-for-upgrade.ts upgrade --dry-run --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --env production --verbose
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import {
    bestTierForMetrics,
    computeScore,
    groupedCriteriaForTier,
    SCORING_CRITERIA,
    scoreCriterion,
    TIER_THRESHOLDS,
    TIERS,
    type TierName,
    tierIndex,
} from "../src/tier-config.ts";
import { scoreUsers as runLLMScorer } from "./llm-scorer.ts";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const BATCH_SIZE = 30;
const MAX_USERS_PER_RUN = 8000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Tiers eligible for automatic upgrade (below nectar)
const UPGRADEABLE_TIERS: TierName[] = ["microbe", "spore", "seed", "flower"];

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
    created_at: number;
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
                timeout: 300_000,
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

/** Fetch users eligible for upgrade (any tier below nectar), with day-slice strategy */
function fetchEligibleUsers(env: Environment): {
    newUsers: D1User[];
    sliceUsers: D1User[];
    totalOld: number;
} {
    const tierList = UPGRADEABLE_TIERS.map((t) => `'${t}'`).join(", ");
    const weekday = new Date().getUTCDay();
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    const newRows = queryD1(
        `SELECT id, github_username, tier, created_at FROM user
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
        `SELECT id, github_username, tier, created_at FROM user
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

/** Fetch total PAID pollen spend over the last 7 days for ALL users in one query.
 *  Only counts pack + crypto purchases (excludes free tier balance usage). */
async function fetchSpendByUserId(): Promise<Map<string, number>> {
    const token = getTinybirdToken();
    const sql = `
    SELECT
      user_id,
      sum(total_price) AS spend_7d
    FROM generation_event
    WHERE start_time >= now() - INTERVAL 7 DAY
      AND environment = 'production'
      AND user_id != ''
      AND user_id != 'undefined'
      AND selected_meter_slug IN ('v1:meter:pack', 'v1:meter:crypto')
    GROUP BY user_id
    FORMAT JSON
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
            data: Array<{ user_id: string; spend_7d: number }>;
        };
        return new Map(json.data.map((row) => [row.user_id, row.spend_7d]));
    } catch (err) {
        console.warn("Tinybird fetch error:", err);
        return new Map();
    }
}

/** Fetch weekly PAID spend for a single user by D1 user id.
 *  Only counts pack + crypto purchases (excludes free tier balance usage). */
async function fetchSpendForUser(userId: string): Promise<number> {
    const token = getTinybirdToken();
    const sql = `
    SELECT sum(total_price) AS spend_7d
    FROM generation_event
    WHERE start_time >= now() - INTERVAL 7 DAY
      AND environment = 'production'
      AND user_id = '${userId}'
      AND selected_meter_slug IN ('v1:meter:pack', 'v1:meter:crypto')
    FORMAT JSON
  `
        .trim()
        .replace(/\n\s+/g, " ");

    const url = `${TINYBIRD_BASE}/v0/sql?q=${encodeURIComponent(sql)}`;
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return 0;
        const json = (await response.json()) as {
            data: Array<{ spend_7d: number }>;
        };
        return json.data[0]?.spend_7d ?? 0;
    } catch {
        return 0;
    }
}

// ── GitHub GraphQL ──────────────────────────────────────────────────────

interface GitHubMetrics {
    github_age_days: number;
    repos: number;
    commits: number;
    stars: number;
    apps_listed: number;
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
    const github_age_days = Math.floor(
        (Date.now() - new Date(data.createdAt).getTime()) / 86400000,
    );
    const repos = data.repositories?.totalCount || 0;
    const commits = data.contributionsCollection?.totalCommitContributions || 0;
    const stars = (data.repositories?.nodes || []).reduce(
        (sum, node) => sum + (node?.stargazerCount || 0),
        0,
    );
    return {
        github_age_days,
        repos,
        commits,
        stars,
        apps_listed: 0,
    };
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
                if (retryAfter) wait = Number.parseInt(retryAfter, 10) + 1;
                else if (resetAt)
                    wait =
                        Math.max(
                            Number.parseInt(resetAt, 10) -
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
    const PARALLEL = 3;

    // Build all batch slices
    const batches: string[][] = [];
    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        batches.push(usernames.slice(i, i + BATCH_SIZE));
    }

    // Process in parallel chunks of PARALLEL batches
    for (let i = 0; i < batches.length; i += PARALLEL) {
        const chunk = batches.slice(i, i + PARALLEL);
        const results = await Promise.all(
            chunk.map((batch) => fetchGitHubBatch(batch, token)),
        );
        for (const batchResult of results) {
            for (const [k, v] of batchResult) result.set(k, v);
        }

        const progress = Math.min(
            (i + PARALLEL) * BATCH_SIZE,
            usernames.length,
        );
        console.log(
            `  GitHub profiles: ${progress}/${usernames.length} fetched`,
        );

        // Small delay to stay well within rate limits
        if (i + PARALLEL < batches.length) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    // Count listed apps per user from apps/APPS.md
    const appCounts = countListedApps(usernames);
    for (const [username, count] of appCounts) {
        const metrics = result.get(username);
        if (metrics) {
            metrics.apps_listed = count;
        } else {
            result.set(username, { ...EMPTY_GITHUB, apps_listed: count });
        }
    }

    return result;
}

// ── Listed apps ────────────────────────────────────────────────────────

const APPS_MD_PATH = new URL("../../apps/APPS.md", import.meta.url);

/** Parse apps/APPS.md and count how many listed apps each username has. */
function countListedApps(usernames: string[]): Map<string, number> {
    const result = new Map<string, number>();
    try {
        const content = readFileSync(APPS_MD_PATH, "utf-8");
        const lowerSet = new Set(usernames.map((u) => u.toLowerCase()));

        for (const line of content.split("\n")) {
            if (!line.startsWith("|") || line.startsWith("| ---")) continue;
            const cols = line.split("|").map((c) => c.trim());
            // Column 7 is GitHub_Username (1-indexed after leading empty from split)
            const raw = cols[7]?.replace(/^@/, "") ?? "";
            if (!raw || !lowerSet.has(raw.toLowerCase())) continue;
            // Find original-case username
            const original = usernames.find(
                (u) => u.toLowerCase() === raw.toLowerCase(),
            );
            if (original) {
                result.set(original, (result.get(original) ?? 0) + 1);
            }
        }
    } catch {
        // APPS.md not found (e.g. running in CI without full checkout)
    }
    if (result.size > 0) {
        console.log(`  Listed apps: ${result.size} users with apps`);
    }
    return result;
}

// ── Scoring ─────────────────────────────────────────────────────────────

interface ScoreResult {
    userId: string;
    username: string;
    currentTier: string;
    newTier: TierName;
    upgraded: boolean;
    scores: Record<string, number>;
    total: number;
}

const EMPTY_GITHUB: GitHubMetrics = {
    github_age_days: 0,
    repos: 0,
    commits: 0,
    stars: 0,
    apps_listed: 0,
};

function scoreUser(
    user: D1User,
    githubMetrics: GitHubMetrics | null,
    weeklySpend: number,
    trustScore: number,
): ScoreResult {
    const pollinationsAgeDays = user.created_at
        ? Math.floor((Date.now() / 1000 - user.created_at) / 86400)
        : 0;
    const rawMetrics: Record<string, number> = {
        ...(githubMetrics ?? EMPTY_GITHUB),
        pollinations_age_days: pollinationsAgeDays,
        spend_7d: weeklySpend,
        trust_score: trustScore,
    };

    // Per-criterion scores (all criteria, for verbose output)
    const scores: Record<string, number> = {};
    for (const c of SCORING_CRITERIA) {
        scores[c.field] = scoreCriterion(c, rawMetrics[c.field] ?? 0);
    }

    const newTier = bestTierForMetrics(rawMetrics);
    const total = computeScore(rawMetrics, newTier);

    // Only upgrade, never downgrade
    const currentIdx = tierIndex(user.tier as TierName);
    const newIdx = tierIndex(newTier);
    const upgraded = newIdx > currentIdx;

    return {
        userId: user.id,
        username: user.github_username,
        currentTier: user.tier,
        newTier: upgraded ? newTier : (user.tier as TierName),
        upgraded,
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
            console.log(`  ${username}: -> ${toTier}`);
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
 * Legitimate accounts get ~ 100, suspicious ones get low/zero.
 * Chunks the D1 query to avoid SQL length limits.
 */
async function fetchLLMTrustScores(
    users: D1User[],
): Promise<Map<string, number>> {
    const D1_CHUNK = 500;
    const allScored: Array<{ github_username: string | null; score: number }> =
        [];

    for (let i = 0; i < users.length; i += D1_CHUNK) {
        const chunk = users.slice(i, i + D1_CHUNK);
        const usernameList = chunk
            .map((u) => `'${u.github_username}'`)
            .join(", ");
        const userQuery = `SELECT email, github_username, created_at, tier FROM user WHERE github_username IN (${usernameList})`;

        const scored = await runLLMScorer({
            name: `upgrade-trust-${i}`,
            userQuery,
            buildPrompt: buildAbusePrompt,
            chunkSize: 100,
            model: "openai",
            parallelism: 2,
        });
        allScored.push(...scored);
        console.log(
            `  LLM trust: ${Math.min(i + D1_CHUNK, users.length)}/${users.length}`,
        );
    }

    const trustScores = new Map<string, number>();
    for (const u of allScored) {
        if (u.github_username) {
            trustScores.set(u.github_username, 100 - u.score);
        }
    }
    return trustScores;
}

// ── CLI ─────────────────────────────────────────────────────────────────

const upgradeCommand = command({
    name: "upgrade",
    desc: "Compute scores and upgrade all eligible users",
    options: {
        env: string().enum("staging", "production").default("production"),
        dryRun: boolean().default(false).desc("Validate only, no upgrades"),
        verbose: boolean()
            .default(false)
            .desc("Show per-user score breakdowns"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const weekday = new Date().getUTCDay();

        console.log(`Tier upgrade run`);
        console.log(
            `Environment: ${env} | Mode: ${opts.dryRun ? "DRY RUN" : "LIVE"} | Day: ${DAY_NAMES[weekday]}`,
        );
        console.log(
            `Criteria: ${SCORING_CRITERIA.length} | Thresholds: ${JSON.stringify(TIER_THRESHOLDS)}\n`,
        );

        // Fetch all eligible users
        const { newUsers, sliceUsers, totalOld } = fetchEligibleUsers(env);
        console.log(
            `New (last 24h): ${newUsers.length} | Slice (1/7): ${sliceUsers.length} of ${totalOld}`,
        );

        let users = [...newUsers, ...sliceUsers];
        if (users.length > MAX_USERS_PER_RUN) {
            users = users.slice(0, MAX_USERS_PER_RUN);
            console.log(`Capped at ${MAX_USERS_PER_RUN}`);
        }
        if (users.length === 0) {
            console.log("No eligible users");
            return;
        }

        // Fetch all data sources in parallel
        console.log(`\nFetching data for ${users.length} users...`);
        const [spendByUserId, githubMetrics, llmTrustScores] =
            await Promise.all([
                fetchSpendByUserId(),
                fetchGitHubMetrics(users.map((u) => u.github_username)),
                fetchLLMTrustScores(users),
            ]);
        console.log(
            `  Tinybird: ${spendByUserId.size} | GitHub: ${githubMetrics.size} | LLM: ${llmTrustScores.size}`,
        );

        // Score all users
        const results: ScoreResult[] = users.map((user) =>
            scoreUser(
                user,
                githubMetrics.get(user.github_username) ?? null,
                spendByUserId.get(user.id) ?? 0,
                llmTrustScores.get(user.github_username) ?? 100,
            ),
        );

        const upgraded = results.filter((r) => r.upgraded);
        const unchanged = results.filter((r) => !r.upgraded);
        console.log(
            `\nScored: ${results.length} | To upgrade: ${upgraded.length} | Unchanged: ${unchanged.length}`,
        );

        if (opts.verbose) {
            const fields = SCORING_CRITERIA.map((c) => c.field);
            const header = [
                "Username".padEnd(25),
                "Tier".padEnd(8),
                ...fields.map((f) => f.slice(0, 10).padEnd(10)),
                "Total",
                "New tier",
            ];
            console.log(`\n  ${header.join(" ")}`);
            const separator = [
                "-".repeat(25),
                "-".repeat(8),
                ...fields.map(() => "-".repeat(10)),
                "-----",
                "--------",
            ].join(" ");
            console.log(`  ${separator}`);
            for (const r of results.slice(0, 30)) {
                const cols = [
                    r.username.padEnd(25),
                    r.currentTier.padEnd(8),
                    ...fields.map((f) =>
                        (r.scores[f] ?? 0).toFixed(1).padStart(10),
                    ),
                    `${r.upgraded ? "+" : " "}${r.total.toFixed(1)}`,
                    r.upgraded ? r.newTier : "",
                ];
                console.log(`  ${cols.join(" ")}`);
            }
            if (results.length > 30)
                console.log(`  ... and ${results.length - 30} more`);
        }

        if (upgraded.length === 0 || opts.dryRun) {
            if (opts.dryRun && upgraded.length > 0) {
                console.log(`\n[DRY RUN] Would upgrade ${upgraded.length}:`);
                for (const r of upgraded.slice(0, 15)) {
                    console.log(
                        `  ${r.username}: ${r.currentTier} -> ${r.newTier} (${r.total.toFixed(1)} pts)`,
                    );
                }
                if (upgraded.length > 15)
                    console.log(`  ... and ${upgraded.length - 15} more`);
            }
            return;
        }

        console.log(`\nUpgrading ${upgraded.length} users...`);
        let success = 0;
        let failed = 0;
        for (const r of upgraded) {
            if (applyUpgrade(r.username, r.newTier, env)) success++;
            else failed++;
        }
        console.log(`\nDone: ${success} upgraded, ${failed} failed`);
        if (failed > 0) process.exit(1);
    },
});

const scoreCommand = command({
    name: "score",
    desc: "Score a single user and show full breakdown",
    options: {
        username: string().required().desc("GitHub username"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const username = opts.username;

        // Look up user in D1
        const rows = queryD1(
            `SELECT id, github_username, tier, created_at FROM user WHERE github_username = '${username}'`,
            env,
        );
        if (rows.length === 0) {
            console.error(`User "${username}" not found in ${env}`);
            process.exit(1);
        }
        const user = rows[0] as D1User;

        // Fetch all data in parallel
        const [githubMap, weeklySpend] = await Promise.all([
            fetchGitHubMetrics([username]),
            fetchSpendForUser(user.id),
        ]);
        const gh = githubMap.get(username) ?? EMPTY_GITHUB;

        const pollinationsAgeDays = user.created_at
            ? Math.floor((Date.now() / 1000 - user.created_at) / 86400)
            : 0;
        const rawMetrics: Record<string, number> = {
            ...gh,
            pollinations_age_days: pollinationsAgeDays,
            spend_7d: weeklySpend,
            trust_score: 100, // skip LLM for single-user check
        };

        const tier = bestTierForMetrics(rawMetrics);
        const total = computeScore(rawMetrics, tier);

        // Print header
        console.log(`\n  User:    ${username}`);
        console.log(`  Current: ${user.tier}`);
        console.log(`  Score:   ${total.toFixed(1)} pts → ${tier}`);
        console.log(`  Pollen:  ${TIERS[tier].pollen}/day\n`);

        // Per-criterion breakdown
        console.log(
            `  ${"Criterion".padEnd(22)} ${"Raw".padStart(8)} ${"Pts".padStart(8)} ${"Cap".padStart(8)}  Group`,
        );
        console.log(`  ${"-".repeat(70)}`);

        for (const c of SCORING_CRITERIA) {
            const raw = rawMetrics[c.field] ?? 0;
            const pts = scoreCriterion(c, raw);
            const active = tierIndex(c.unlocksAt) <= tierIndex(tier);
            const marker = active ? " " : "░";
            console.log(
                `${marker} ${c.label.padEnd(22)} ${raw.toFixed(1).padStart(8)} ${pts.toFixed(1).padStart(8)} ${`/${c.max}`.padStart(8)}  ${c.group}`,
            );
        }

        // Grouped summary (always show all groups)
        const allGroups = groupedCriteriaForTier("nectar" as TierName);
        console.log(`\n  ${"Group".padEnd(22)} ${"Pts".padStart(8)}`);
        console.log(`  ${"-".repeat(32)}`);
        for (const g of allGroups) {
            const groupPts = SCORING_CRITERIA.filter(
                (c) => c.group === g.group,
            ).reduce(
                (sum, c) => sum + scoreCriterion(c, rawMetrics[c.field] ?? 0),
                0,
            );
            console.log(
                `  ${g.group.padEnd(22)} ${groupPts.toFixed(1).padStart(5)}/${g.max}`,
            );
        }
        const maxThreshold = Math.max(...Object.values(TIER_THRESHOLDS));
        console.log(
            `  ${"TOTAL".padEnd(22)} ${total.toFixed(1).padStart(5)}/${maxThreshold}\n`,
        );

        // Tier thresholds
        for (const [t, threshold] of Object.entries(TIER_THRESHOLDS)) {
            const s = computeScore(rawMetrics, t as TierName);
            const pass = s >= threshold ? "✓" : " ";
            console.log(
                `  ${pass} ${t.padEnd(8)} ${s.toFixed(1).padStart(5)} / ${threshold} pts`,
            );
        }
        console.log();
    },
});

const dumpCommand = command({
    name: "dump",
    desc: "Dump raw metrics for a sample of users as JSON (for the scoring playground)",
    options: {
        env: string().enum("staging", "production").default("production"),
        limit: string().default("50").desc("Max users per tier to sample"),
        output: string().default("").desc("Output file path (default: stdout)"),
        llm: boolean().default(false).desc("Run LLM trust scoring (slower)"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const perTier = Number.parseInt(opts.limit, 10);

        const tiers = ["microbe", "spore", "seed", "flower", "nectar"];
        const allUsers: D1User[] = [];

        for (const tier of tiers) {
            // Skip ORDER BY RANDOM() when fetching all users (limit >= 50000)
            const orderClause = perTier >= 50000 ? "" : "ORDER BY RANDOM()";
            const rows = queryD1(
                `SELECT id, github_username, tier, created_at FROM user WHERE tier = '${tier}' AND github_username IS NOT NULL ${orderClause} LIMIT ${perTier}`,
                env,
            );
            allUsers.push(...(rows as D1User[]));
            console.error(`  ${tier}: ${rows.length} users`);
        }

        console.error(`\nFetching data for ${allUsers.length} users...`);
        const usernames = allUsers.map((u) => u.github_username);

        const fetches: [
            Promise<Map<string, number>>,
            Promise<Map<string, GitHubMetrics>>,
            Promise<Map<string, number>>,
        ] = [
            fetchSpendByUserId(),
            fetchGitHubMetrics(usernames),
            opts.llm
                ? fetchLLMTrustScores(allUsers)
                : Promise.resolve(new Map<string, number>()),
        ];

        const [spendByUserId, githubMetrics, llmTrustScores] =
            await Promise.all(fetches);

        console.error(
            `  GitHub: ${githubMetrics.size} | LLM: ${llmTrustScores.size}`,
        );

        const dump = allUsers.map((user) => {
            const gh = githubMetrics.get(user.github_username) ?? EMPTY_GITHUB;
            const pollinationsAgeDays = user.created_at
                ? Math.floor((Date.now() / 1000 - user.created_at) / 86400)
                : 0;
            return {
                username: user.github_username,
                currentTier: user.tier,
                userId: user.id,
                metrics: {
                    ...gh,
                    pollinations_age_days: pollinationsAgeDays,
                    spend_7d: spendByUserId.get(user.id) ?? 0,
                    trust_score:
                        llmTrustScores.get(user.github_username) ?? 100,
                },
            };
        });

        const json = JSON.stringify(dump, null, 2);
        if (opts.output) {
            const { writeFileSync } = await import("node:fs");
            writeFileSync(opts.output, json);
            console.error(`Written to ${opts.output}`);
        } else {
            console.log(json);
        }
    },
});

// ── Push scoring snapshots to Tinybird ────────────────────────────────

const TINYBIRD_SCORING_URL = `${TINYBIRD_BASE}/v0/events?name=scoring_snapshot`;
const TINYBIRD_PUSH_BATCH = 500;

async function pushScoringToTinybird(
    dumpData: Array<{
        username: string;
        currentTier: string;
        userId: string;
        metrics: Record<string, number>;
    }>,
): Promise<number> {
    const token = getTinybirdToken();
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    let pushed = 0;

    for (let i = 0; i < dumpData.length; i += TINYBIRD_PUSH_BATCH) {
        const batch = dumpData.slice(i, i + TINYBIRD_PUSH_BATCH);
        const ndjson = batch
            .map((u) => {
                const m = u.metrics;
                const rawMetrics: Record<string, number> = { ...m };
                const computedTier = bestTierForMetrics(rawMetrics);
                const total = computeScore(rawMetrics, computedTier);
                return JSON.stringify({
                    timestamp,
                    user_id: u.userId,
                    github_username: u.username,
                    current_tier: u.currentTier,
                    computed_tier: computedTier,
                    total_score: Math.round(total * 100) / 100,
                    github_age_days: m.github_age_days ?? 0,
                    pollinations_age_days: m.pollinations_age_days ?? 0,
                    spend_7d: m.spend_7d ?? 0,
                    trust_score: m.trust_score ?? 100,
                    commits: m.commits ?? 0,
                    repos: m.repos ?? 0,
                    stars: m.stars ?? 0,
                    apps_listed: m.apps_listed ?? 0,
                });
            })
            .join("\n");

        const response = await fetch(TINYBIRD_SCORING_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-ndjson",
            },
            body: ndjson,
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(
                `Tinybird push failed at batch ${i}: ${response.status} ${text}`,
            );
            break;
        }
        pushed += batch.length;
        if ((i / TINYBIRD_PUSH_BATCH) % 10 === 0) {
            console.error(`  Pushed ${pushed}/${dumpData.length} to Tinybird`);
        }
    }
    return pushed;
}

const pushScoringCommand = command({
    name: "push-scoring",
    desc: "Push a scoring dump JSON to Tinybird scoring_snapshot datasource",
    options: {
        input: string().required().desc("Path to scoring-data JSON file"),
    },
    handler: async (opts) => {
        const { readFileSync } = await import("node:fs");
        const data = JSON.parse(readFileSync(opts.input, "utf-8"));
        console.error(`Loaded ${data.length} users from ${opts.input}`);
        const pushed = await pushScoringToTinybird(data);
        console.error(`Done: pushed ${pushed} rows to Tinybird`);
    },
});

run([upgradeCommand, scoreCommand, dumpCommand, pushScoringCommand]);
