#!/usr/bin/env npx tsx
/**
 * Tier Upgrade: Microbe/Spore → Seed
 *
 * TypeScript port of the Python user_upgrade_spore_to_seed.py + user_validate_github_profile.py.
 * Same deterministic GitHub profile scoring formula, same day-based slicing strategy.
 *
 * Scoring formula (unchanged from Python):
 *   - GitHub account age: 0.5 pt/month (max 6, so 12 months to max)
 *   - Commits (any repo): 0.1 pt each (max 2)
 *   - Public repos: 0.5 pt each (max 1)
 *   - Stars (total across repos): 0.1 pt each (max 5)
 *   - Threshold: >= 8 pts → upgrade to seed
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/score-for-upgrade.ts upgrade --dry-run --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --verbose
 */

import { execSync } from "node:child_process";
import { boolean, command, run, string } from "@drizzle-team/brocli";

// ── Scoring config (same values as Python) ─────────────────────────────

const SCORING = [
    { field: "age_days", multiplier: 0.5 / 30, max: 6.0 }, // 0.5pt/month, max 6
    { field: "commits", multiplier: 0.1, max: 2.0 }, // 0.1pt each, max 2
    { field: "repos", multiplier: 0.5, max: 1.0 }, // 0.5pt each, max 1
    { field: "stars", multiplier: 0.1, max: 5.0 }, // 0.1pt each, max 5
] as const;

const THRESHOLD = 8.0;
const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const BATCH_SIZE = 50;
const MAX_USERS_PER_RUN = 8000;

// ── D1 queries ─────────────────────────────────────────────────────────

type Environment = "staging" | "production";

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

interface FetchResult {
    newUsers: string[];
    sliceUsers: string[];
    totalOld: number;
}

function fetchEligibleUsers(env: Environment): FetchResult {
    const weekday = new Date().getUTCDay(); // 0=Sun..6=Sat
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    // New users (last 24h) — check microbe and spore
    const newResults = queryD1(
        `SELECT github_username FROM user
         WHERE tier IN ('microbe', 'spore')
         AND github_username IS NOT NULL
         AND created_at > ${yesterday}`,
        env,
    );
    const newUsers = newResults.map((r) => r.github_username as string);

    // Count older users
    const countResults = queryD1(
        `SELECT COUNT(*) as count FROM user
         WHERE tier IN ('microbe', 'spore')
         AND github_username IS NOT NULL
         AND created_at <= ${yesterday}`,
        env,
    );
    const totalOld = (countResults[0]?.count as number) || 0;

    // Today's slice (1/7th via LIMIT/OFFSET)
    const sliceSize = Math.ceil(totalOld / 7);
    const offset = weekday * sliceSize;

    const sliceResults = queryD1(
        `SELECT github_username FROM user
         WHERE tier IN ('microbe', 'spore')
         AND github_username IS NOT NULL
         AND created_at <= ${yesterday}
         ORDER BY created_at ASC
         LIMIT ${sliceSize} OFFSET ${offset}`,
        env,
    );
    const sliceUsers = sliceResults.map((r) => r.github_username as string);

    return { newUsers, sliceUsers, totalOld };
}

// ── GitHub GraphQL validation ──────────────────────────────────────────

interface ScoreResult {
    username: string;
    approved: boolean;
    reason: string;
    details: {
        age_days: number;
        age_pts: number;
        repos: number;
        repos_pts: number;
        commits: number;
        commits_pts: number;
        stars: number;
        stars_pts: number;
        total: number;
    } | null;
}

function getGithubToken(): string {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error("GITHUB_TOKEN environment variable required");
        process.exit(1);
    }
    return token;
}

function buildGraphQLQuery(usernames: string[]): string {
    const fragments = usernames.map((username, i) => {
        const safe = username.replace(/"/g, '\\"').replace(/\\/g, "\\\\");
        return `u${i}: user(login: "${safe}") {
      login
      createdAt
      repositories(privacy: PUBLIC, isFork: false, first: 5, orderBy: {field: STARGAZERS, direction: DESC}) {
        totalCount
        nodes { stargazerCount }
      }
      contributionsCollection { totalCommitContributions }
    }`;
    });
    return `query { ${fragments.join("\n")} }`;
}

function scoreUser(
    data: Record<string, unknown> | null,
    username: string,
): ScoreResult {
    if (!data) {
        return {
            username,
            approved: false,
            reason: "User not found",
            details: null,
        };
    }

    const created = new Date(data.createdAt as string);
    const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);

    const repos =
        (data.repositories as { totalCount: number })?.totalCount || 0;
    const commits =
        (data.contributionsCollection as { totalCommitContributions: number })
            ?.totalCommitContributions || 0;
    const nodes =
        (
            data.repositories as {
                nodes: Array<{ stargazerCount: number } | null>;
            }
        )?.nodes || [];
    const stars = nodes.reduce((sum, n) => sum + (n?.stargazerCount || 0), 0);

    const metrics: Record<string, number> = {
        age_days: ageDays,
        repos,
        commits,
        stars,
    };

    const scores: Record<string, number> = {};
    for (const cfg of SCORING) {
        const raw = metrics[cfg.field] * cfg.multiplier;
        scores[cfg.field] = Math.min(raw, cfg.max);
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    return {
        username,
        approved: total >= THRESHOLD,
        reason: `${total.toFixed(1)} pts`,
        details: {
            age_days: ageDays,
            age_pts: scores.age_days,
            repos,
            repos_pts: scores.repos,
            commits,
            commits_pts: scores.commits,
            stars,
            stars_pts: scores.stars,
            total,
        },
    };
}

async function fetchAndScoreBatch(
    usernames: string[],
    token: string,
    retries = 3,
): Promise<ScoreResult[]> {
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
                console.log(
                    `  Rate limited (${response.status}), waiting ${wait}s...`,
                );
                await new Promise((r) => setTimeout(r, wait * 1000));
                continue;
            }

            if (!response.ok && attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                continue;
            }

            const json = await response.json();
            const results = json?.data || {};

            return usernames.map((username, i) => {
                const userData = results[`u${i}`] || null;
                return scoreUser(userData, username);
            });
        } catch (error) {
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                continue;
            }
            console.error("GitHub API batch failed:", error);
        }
    }

    // All retries exhausted
    return usernames.map((u) => ({
        username: u,
        approved: false,
        reason: "API error",
        details: null,
    }));
}

async function validateUsers(usernames: string[]): Promise<ScoreResult[]> {
    if (usernames.length === 0) return [];

    const token = getGithubToken();
    const results: ScoreResult[] = [];
    let approvedCount = 0;

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        const batchResults = await fetchAndScoreBatch(batch, token);
        results.push(...batchResults);

        approvedCount += batchResults.filter((r) => r.approved).length;
        const pct = ((approvedCount / results.length) * 100).toFixed(0);
        const progress = Math.min(i + BATCH_SIZE, usernames.length);
        console.log(
            `  ${progress}/${usernames.length} validated (${pct}% approved)`,
        );

        // Rate limiting between batches (same as Python)
        if (i + BATCH_SIZE < usernames.length) {
            await new Promise((r) => setTimeout(r, 2000));
        }
    }

    return results;
}

// ── Upgrade via tier-update-user.ts ────────────────────────────────────

function upgradeUser(username: string, env: Environment): boolean {
    try {
        const result = execSync(
            `npx tsx scripts/tier-update-user.ts update-tier --githubUsername "${username}" --tier seed --env ${env}`,
            {
                encoding: "utf-8",
                cwd: process.cwd(),
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 120_000,
            },
        );

        if (result.includes("SKIP_UPGRADE=true")) {
            console.log(`  ${username}: already at higher tier`);
            return true;
        }

        console.log(`  ${username}: upgraded to seed`);
        return true;
    } catch (error) {
        console.error(
            `  ${username}: upgrade failed -`,
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

// ── CLI ────────────────────────────────────────────────────────────────

const upgradeCommand = command({
    name: "upgrade",
    desc: "Upgrade eligible microbe/spore users to seed tier",
    options: {
        env: string().enum("staging", "production").default("production"),
        dryRun: boolean().default(false).desc("Validate only, no upgrades"),
        verbose: boolean().default(false).desc("Show score breakdowns"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const weekday = new Date().getUTCDay();
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        console.log("Microbe/Spore -> Seed Upgrade");
        console.log("=".repeat(50));
        console.log(`Environment: ${env}`);
        console.log(`Mode: ${opts.dryRun ? "DRY RUN" : "LIVE"}`);
        console.log(`Day slice: ${dayNames[weekday]} (${weekday + 1}/7)`);
        console.log();

        // Fetch eligible users
        console.log("Fetching eligible users from D1...");
        const { newUsers, sliceUsers, totalOld } = fetchEligibleUsers(env);
        console.log(`  New users (last 24h): ${newUsers.length}`);
        console.log(
            `  Today's slice: ${sliceUsers.length} (of ${totalOld} total older)`,
        );

        let users = [...newUsers, ...sliceUsers];
        if (users.length > MAX_USERS_PER_RUN) {
            console.log(
                `  Limiting to ${MAX_USERS_PER_RUN} (was ${users.length})`,
            );
            users = users.slice(0, MAX_USERS_PER_RUN);
        }
        console.log(`  Total to process: ${users.length}`);

        if (users.length === 0) {
            console.log("\nNo users to process");
            return;
        }

        // Validate via GitHub GraphQL
        const newResults: ScoreResult[] = [];
        const sliceResults: ScoreResult[] = [];

        if (newUsers.length > 0) {
            console.log(
                `\nPhase 1: Validating ${newUsers.length} NEW users (last 24h)...`,
            );
            const results = await validateUsers(newUsers);
            newResults.push(...results);
            const approved = results.filter((r) => r.approved).length;
            console.log(
                `  Approved: ${approved}/${results.length} (${((approved / results.length) * 100).toFixed(0)}%)`,
            );
        }

        if (sliceUsers.length > 0) {
            console.log(
                `\nPhase 2: Validating ${sliceUsers.length} SLICE users (day ${weekday + 1}/7)...`,
            );
            const results = await validateUsers(sliceUsers);
            sliceResults.push(...results);
            const approved = results.filter((r) => r.approved).length;
            console.log(
                `  Approved: ${approved}/${results.length} (${((approved / results.length) * 100).toFixed(0)}%)`,
            );
        }

        const allResults = [...newResults, ...sliceResults];
        const approved = allResults.filter((r) => r.approved);
        const rejected = allResults.filter((r) => !r.approved);

        console.log(
            `\nTotal: ${approved.length} approved, ${rejected.length} rejected`,
        );

        if (rejected.length > 0) {
            console.log("\n  Rejected:");
            for (const r of rejected.slice(0, 10)) {
                console.log(`    ${r.username}: ${r.reason}`);
            }
            if (rejected.length > 10) {
                console.log(`    ... and ${rejected.length - 10} more`);
            }
        }

        if (opts.verbose) {
            console.log("\nScore breakdown (first 20):");
            console.log(
                `  ${"Username".padEnd(25)} ${"Age".padEnd(12)} ${"Repos".padEnd(12)} ${"Commits".padEnd(12)} ${"Stars".padEnd(12)} Total`,
            );
            console.log(
                `  ${"-".repeat(25)} ${"-".repeat(12)} ${"-".repeat(12)} ${"-".repeat(12)} ${"-".repeat(12)} -----`,
            );
            for (const r of allResults.slice(0, 20)) {
                const d = r.details;
                if (d) {
                    const status = r.approved ? "+" : "-";
                    console.log(
                        `  ${r.username.padEnd(25)} ${String(d.age_days).padStart(4)}d=${d.age_pts.toFixed(1).padStart(4)}pt ${String(d.repos).padStart(3)}=${d.repos_pts.toFixed(1).padStart(4)}pt  ${String(d.commits).padStart(4)}=${d.commits_pts.toFixed(1).padStart(4)}pt ${String(d.stars).padStart(4)}=${d.stars_pts.toFixed(1).padStart(4)}pt ${status}${d.total.toFixed(1)}`,
                    );
                } else {
                    console.log(`  ${r.username.padEnd(25)} (not found)`);
                }
            }
        }

        if (approved.length === 0) {
            console.log("\nNo users approved for upgrade");
            return;
        }

        if (opts.dryRun) {
            console.log(`\n[DRY RUN] Would upgrade ${approved.length} users:`);
            for (const r of approved.slice(0, 20)) {
                console.log(`  ${r.username} (${r.reason})`);
            }
            if (approved.length > 20) {
                console.log(`  ... and ${approved.length - 20} more`);
            }
            return;
        }

        // Apply upgrades
        console.log(`\nUpgrading ${approved.length} users...`);
        let success = 0;
        let failed = 0;

        for (const r of approved) {
            if (upgradeUser(r.username, env)) {
                success++;
            } else {
                failed++;
            }
        }

        console.log(`\nResults:`);
        console.log(`  Upgraded: ${success}`);
        console.log(`  Failed: ${failed}`);

        if (failed > 0) process.exit(1);
    },
});

run([upgradeCommand]);
