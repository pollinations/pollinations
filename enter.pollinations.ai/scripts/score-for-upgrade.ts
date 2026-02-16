#!/usr/bin/env npx tsx
/**
 * Tier Upgrade Scorer
 *
 * Uses the shared LLM scoring pipeline to evaluate user legitimacy and upgrade tiers.
 * Replaces the Python-based user_upgrade_spore_to_seed.py and user_validate_github_profile.py.
 *
 * Fetches real GitHub profile data (account age, repos, commits, stars) via GraphQL,
 * includes it in the CSV sent to the LLM so it has concrete metrics — not just guessing
 * from usernames. The LLM also sees users in chunks, catching cross-user patterns
 * (clusters of fake accounts, burst registrations) that individual scoring misses.
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/score-for-upgrade.ts upgrade --dry-run --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --env production
 *   npx tsx scripts/score-for-upgrade.ts upgrade --model claude --verbose
 *
 * Tier thresholds (legitimacy score 0-100):
 *   Microbe (0-29)  - New/unverified account
 *   Spore   (30+)   - Basic legitimate account (~1 week old, has GitHub)
 *   Seed    (60+)   - Active developer with real activity
 *   Flower  (80+)   - Contributor with merged work in pollinations org
 */

import { execSync } from "node:child_process";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import type { TierName } from "../src/tier-config.ts";
import {
    type ScoredUser,
    type User,
    formatDate,
    scoreUsers,
} from "./llm-scorer.ts";

// Tier hierarchy for comparison
const TIER_HIERARCHY: TierName[] = [
    "microbe",
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
];

function getTierRank(tier: string): number {
    return TIER_HIERARCHY.indexOf(tier as TierName);
}

// Legitimacy score -> target tier
const TIER_THRESHOLDS: Array<{ minScore: number; tier: TierName }> = [
    { minScore: 80, tier: "flower" },
    { minScore: 60, tier: "seed" },
    { minScore: 30, tier: "spore" },
];

function getTargetTier(score: number): TierName {
    for (const { minScore, tier } of TIER_THRESHOLDS) {
        if (score >= minScore) return tier;
    }
    return "microbe";
}

// ── GitHub GraphQL enrichment ──────────────────────────────────────────

interface GitHubProfile {
    age_days: number;
    repos: number;
    commits: number;
    stars: number;
}

// Store GitHub data keyed by username
const githubProfiles = new Map<string, GitHubProfile>();

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_BATCH_SIZE = 50;

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

async function fetchGitHubBatch(
    usernames: string[],
    token: string,
    retries = 3,
): Promise<void> {
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
                const wait = retryAfter ? parseInt(retryAfter, 10) + 1 : 60;
                console.log(`  Rate limited, waiting ${wait}s...`);
                await new Promise((r) => setTimeout(r, wait * 1000));
                continue;
            }

            if (!response.ok && attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                continue;
            }

            const data = await response.json();
            const results = data?.data || {};

            for (let i = 0; i < usernames.length; i++) {
                const userData = results[`u${i}`];
                if (!userData) continue;

                const created = new Date(userData.createdAt);
                const ageDays = Math.floor(
                    (Date.now() - created.getTime()) / 86400000,
                );
                const stars = (userData.repositories?.nodes || []).reduce(
                    (sum: number, n: { stargazerCount: number } | null) =>
                        sum + (n?.stargazerCount || 0),
                    0,
                );

                githubProfiles.set(usernames[i], {
                    age_days: ageDays,
                    repos: userData.repositories?.totalCount || 0,
                    commits:
                        userData.contributionsCollection
                            ?.totalCommitContributions || 0,
                    stars,
                });
            }
            return;
        } catch (error) {
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
                continue;
            }
            console.error("GitHub API batch failed:", error);
        }
    }
}

/**
 * Enrich users with GitHub profile data (account age, repos, commits, stars).
 * Batches into groups of 50 to match the GraphQL API pattern from the old Python script.
 */
async function enrichWithGitHub(users: User[]): Promise<User[]> {
    const token = getGithubToken();
    const usersWithGithub = users.filter((u) => u.github_username);
    const usernames = usersWithGithub.map((u) => u.github_username!);

    console.log(
        `  Fetching GitHub profiles for ${usernames.length} users (batches of ${GITHUB_BATCH_SIZE})...`,
    );

    for (let i = 0; i < usernames.length; i += GITHUB_BATCH_SIZE) {
        const batch = usernames.slice(i, i + GITHUB_BATCH_SIZE);
        await fetchGitHubBatch(batch, token);

        // Rate limiting between batches (same as old Python script)
        if (i + GITHUB_BATCH_SIZE < usernames.length) {
            await new Promise((r) => setTimeout(r, 2000));
        }

        const progress = Math.min(i + GITHUB_BATCH_SIZE, usernames.length);
        console.log(`  ${progress}/${usernames.length} profiles fetched`);
    }

    console.log(`  GitHub data: ${githubProfiles.size} profiles found`);
    return users;
}

// ── CSV row builder with GitHub metrics ────────────────────────────────

/**
 * Build CSV row including GitHub metrics.
 * Format: github,email,registered,upgraded,gh_age_days,gh_repos,gh_commits,gh_stars
 * This gives the LLM concrete data to score on, not just username patterns.
 */
function prepareCsvRow(user: User, idx: number): string {
    const github = user.github_username || `user_${idx}`;
    const humanDate = formatDate(user.created_at);
    const upgraded = user.tier !== "spore" && user.tier !== "microbe";
    const profile = githubProfiles.get(github);

    if (profile) {
        return `${github},${user.email},${humanDate},${upgraded},${profile.age_days},${profile.repos},${profile.commits},${profile.stars}`;
    }
    // No GitHub data available
    return `${github},${user.email},${humanDate},${upgraded},,,,`;
}

// ── LLM prompt ─────────────────────────────────────────────────────────

/**
 * Build the legitimacy scoring prompt.
 * Includes real GitHub metrics so the LLM has concrete data.
 * Calibrated to match the existing deterministic scorer's pass rates:
 *   - Old formula: 0.5pt/month age (max 6) + 0.1pt/commit (max 2) + 0.5pt/repo (max 1) + 0.1pt/star (max 5) >= 8
 *   - Roughly: ~12 months old with some repos/commits/stars → seed
 */
function buildLegitimacyPrompt(csvRows: string[]): string {
    return `Evaluate these users for account legitimacy. Score 0-100 (higher = more legitimate).

Each row has: github,email,registered,upgraded,gh_age_days,gh_repos,gh_commits,gh_stars
(gh_ columns are real GitHub profile data — use these as primary signals)

SCORING GUIDE based on GitHub metrics:
- gh_age_days: Account age. >360 days is strong (+20), >30 days moderate (+10), <7 days weak (-10)
- gh_repos: Public repos. >5 is strong (+15), >1 moderate (+10), 0 means no real activity
- gh_commits: Total commit contributions. >100 strong (+20), >20 moderate (+15), >0 some (+5)
- gh_stars: Stars across repos. >10 strong (+15), >0 some (+5)
- Normal email/username patterns (+10), gibberish/disposable patterns (-20)
- upgraded=true means already verified tier, trust bonus (+10)

CROSS-USER PATTERNS (seeing in chunks matters):
- Clusters of similar usernames/emails registering together → likely abuse, score low
- Burst of new accounts with 0 repos/commits → suspicious group
- Accounts that look real individually but share patterns → score cautiously

TARGET CALIBRATION:
- Score 60+ (→seed): Needs real GitHub activity. Roughly: >6 months old AND has repos/commits
- Score 30-59 (→spore): Basic legitimate. Has GitHub, >7 days old, normal patterns
- Score 80+ (→flower): Exceptional. Major contributor, many repos/commits/stars
- Score 0-29 (→stays microbe): New, no GitHub data, suspicious patterns

SIGNALS (use these codes):
aged=account old enough, active=has repos+commits, organic=normal patterns
github=has GitHub linked, newacct=very new, suspicious=abuse patterns, cluster=group pattern

Output CSV: github,score,signals
johndeveloper,70,aged+active+organic+github
newuser123,15,newacct
realdev,55,aged+github

Use + to combine. Empty if no signals.

Data:
${csvRows.join("\n")}`;
}

// ── D1 query ───────────────────────────────────────────────────────────

function buildUserQuery(): string {
    const weekday = new Date().getUTCDay();
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    return `
        SELECT email, github_username, created_at, tier FROM user
        WHERE tier IN ('microbe', 'spore', 'seed')
        AND (
            created_at > ${yesterday}
            OR (created_at <= ${yesterday} AND abs(created_at) % 7 = ${weekday})
        )
        ORDER BY created_at DESC
        LIMIT 5000
    `;
}

// ── Upgrade logic ──────────────────────────────────────────────────────

function upgradeUser(
    username: string,
    targetTier: TierName,
    env: string,
    dryRun: boolean,
): boolean {
    if (dryRun) {
        console.log(`  [DRY RUN] Would upgrade ${username} -> ${targetTier}`);
        return true;
    }

    try {
        const result = execSync(
            `npx tsx scripts/tier-update-user.ts update-tier --githubUsername "${username}" --tier ${targetTier} --env ${env}`,
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

        console.log(`  ${username}: upgraded to ${targetTier}`);
        return true;
    } catch (error) {
        console.error(
            `  ${username}: upgrade failed -`,
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

// ── CLI command ────────────────────────────────────────────────────────

const upgradeCommand = command({
    name: "upgrade",
    desc: "Score users for legitimacy and upgrade tiers",
    options: {
        env: string().enum("staging", "production").default("production"),
        dryRun: boolean()
            .default(false)
            .desc("Show what would be done without making changes"),
        model: string().default("gemini").desc("LLM model to use"),
        chunkSize: string().default("100").desc("Users per API chunk"),
        verbose: boolean().default(false).desc("Show detailed scoring"),
        singleChunk: boolean()
            .default(false)
            .desc("Only process first chunk (testing)"),
    },
    handler: async (opts) => {
        const env = opts.env as string;
        const weekday = new Date().getUTCDay();
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        console.log("Tier Upgrade Scorer");
        console.log("=".repeat(50));
        console.log(`Environment: ${env}`);
        console.log(`Mode: ${opts.dryRun ? "DRY RUN" : "LIVE"}`);
        console.log(`Day slice: ${dayNames[weekday]} (${weekday}/7)`);
        console.log(`Model: ${opts.model}`);
        console.log();

        const scored = await scoreUsers({
            name: "tier-upgrade",
            userQuery: buildUserQuery(),
            buildPrompt: buildLegitimacyPrompt,
            enrichUsers: enrichWithGitHub,
            prepareCsvRow,
            chunkSize: parseInt(opts.chunkSize, 10),
            model: opts.model,
            singleChunk: opts.singleChunk,
            overlapSize: 0,
        });

        if (scored.length === 0) {
            console.log("No users to evaluate");
            return;
        }

        // Determine upgrades
        const upgrades: Array<{
            user: ScoredUser;
            targetTier: TierName;
        }> = [];

        for (const user of scored) {
            const targetTier = getTargetTier(user.score);
            const currentRank = getTierRank(user.tier);
            const targetRank = getTierRank(targetTier);

            if (targetRank > currentRank && user.github_username) {
                upgrades.push({ user, targetTier });
            }
        }

        // Stats
        const tierCounts = {
            microbe: scored.filter((u) => getTargetTier(u.score) === "microbe")
                .length,
            spore: scored.filter((u) => getTargetTier(u.score) === "spore")
                .length,
            seed: scored.filter((u) => getTargetTier(u.score) === "seed")
                .length,
            flower: scored.filter((u) => getTargetTier(u.score) === "flower")
                .length,
        };

        console.log("\nScoring Summary:");
        console.log(`  Total evaluated: ${scored.length}`);
        console.log(`  Target microbe (<30): ${tierCounts.microbe}`);
        console.log(`  Target spore (30-59): ${tierCounts.spore}`);
        console.log(`  Target seed (60-79): ${tierCounts.seed}`);
        console.log(`  Target flower (80+): ${tierCounts.flower}`);
        console.log(`  Eligible for upgrade: ${upgrades.length}`);

        if (opts.verbose) {
            console.log("\nDetailed scores (first 30):");
            for (const user of scored.slice(0, 30)) {
                const target = getTargetTier(user.score);
                const gh = githubProfiles.get(user.github_username || "");
                const ghInfo = gh
                    ? `age=${gh.age_days}d repos=${gh.repos} commits=${gh.commits} stars=${gh.stars}`
                    : "no-github";
                const arrow =
                    getTierRank(target) > getTierRank(user.tier)
                        ? ` -> ${target}`
                        : "";
                console.log(
                    `  ${user.github_username || user.email} | score=${user.score} | ${user.tier}${arrow} | ${ghInfo} | ${user.signals.join("+")}`,
                );
            }
        }

        if (upgrades.length === 0) {
            console.log("\nNo upgrades needed");
            return;
        }

        console.log(
            `\n${opts.dryRun ? "[DRY RUN] " : ""}Processing ${upgrades.length} upgrades...`,
        );

        let success = 0;
        let failed = 0;

        for (const { user, targetTier } of upgrades) {
            if (
                upgradeUser(
                    user.github_username!,
                    targetTier,
                    env,
                    opts.dryRun,
                )
            ) {
                success++;
            } else {
                failed++;
            }
        }

        console.log(`\nResults:`);
        console.log(`  Upgraded: ${success}`);
        console.log(`  Failed: ${failed}`);

        if (failed > 0) {
            process.exit(1);
        }
    },
});

run([upgradeCommand]);
