#!/usr/bin/env node

/**
 * Tier Scoring Script for Spore Users
 *
 * Simplified metrics (GitHub-only):
 * - GitHub account age: 1 pt/month (max 6)
 * - Commits (any repo): 0.1 pt each (max 1)
 * - Public repos: 0.5 pt each (max 1)
 * - GitHub stars (own repos): 0.1 pt each (max 1)
 * - PR merged to pollinations: 8 pt (max 8)
 *
 * Thresholds:
 * - Seed: ≥ 7 pts + GitHub age ≥ 5 months
 * - Flower: ≥ 20 pts (requires PR by math)
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const INPUT_FILE = join(__dirname, "../spore_github_usernames.txt");
const OUTPUT_FILE = join(__dirname, "spore-scores.json");
const SEED_CANDIDATES_FILE = join(__dirname, "seed-candidates.txt");

// Scoring config
const SCORING = {
    githubAgePerMonth: 1,
    githubAgeMax: 6,
    commitsPerCommit: 0.1,
    commitsMax: 1,
    publicReposPerRepo: 0.5,
    publicReposMax: 1,
    starsPerStar: 0.1,
    starsMax: 1,
    prMergedToPolli: 8,
    prMergedMax: 8,
};

const THRESHOLDS = {
    seed: { points: 7, minGithubAgeMonths: 5 },
    flower: { points: 20 },
};

async function fetchGitHubUser(username) {
    const res = await fetch(`https://api.github.com/users/${username}`, {
        headers: GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {},
    });
    if (!res.ok) return null;
    return res.json();
}

async function fetchUserCommitCount(username) {
    // Search for commits by author
    const res = await fetch(
        `https://api.github.com/search/commits?q=author:${username}&per_page=1`,
        {
            headers: {
                Accept: "application/vnd.github.cloak-preview+json",
                ...(GITHUB_TOKEN
                    ? { Authorization: `token ${GITHUB_TOKEN}` }
                    : {}),
            },
        },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total_count || 0;
}

async function fetchUserStars(username) {
    // Get total stars across user's repos
    const res = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=100`,
        {
            headers: GITHUB_TOKEN
                ? { Authorization: `token ${GITHUB_TOKEN}` }
                : {},
        },
    );
    if (!res.ok) return 0;
    const repos = await res.json();
    return repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
}

async function fetchPollinationsPRs(username) {
    // Check for merged PRs to pollinations org
    const res = await fetch(
        `https://api.github.com/search/issues?q=author:${username}+org:pollinations+type:pr+is:merged&per_page=1`,
        {
            headers: GITHUB_TOKEN
                ? { Authorization: `token ${GITHUB_TOKEN}` }
                : {},
        },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total_count || 0;
}

function calculateScore(userData, commits, stars, polliPRs) {
    const now = new Date();
    const createdAt = new Date(userData.created_at);
    const ageMonths = Math.floor(
        (now - createdAt) / (1000 * 60 * 60 * 24 * 30),
    );

    const scores = {
        githubAge: Math.min(
            ageMonths * SCORING.githubAgePerMonth,
            SCORING.githubAgeMax,
        ),
        commits: Math.min(
            commits * SCORING.commitsPerCommit,
            SCORING.commitsMax,
        ),
        publicRepos: Math.min(
            userData.public_repos * SCORING.publicReposPerRepo,
            SCORING.publicReposMax,
        ),
        stars: Math.min(stars * SCORING.starsPerStar, SCORING.starsMax),
        polliPRs: Math.min(
            polliPRs > 0 ? SCORING.prMergedToPolli : 0,
            SCORING.prMergedMax,
        ),
    };

    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    let tier = "spore";
    if (total >= THRESHOLDS.flower.points && polliPRs > 0) {
        tier = "flower";
    } else if (
        total >= THRESHOLDS.seed.points &&
        ageMonths >= THRESHOLDS.seed.minGithubAgeMonths
    ) {
        tier = "seed";
    }

    return {
        username: userData.login,
        ageMonths,
        publicRepos: userData.public_repos,
        commits,
        stars,
        polliPRs,
        scores,
        total: Math.round(total * 10) / 10,
        tier,
    };
}

async function processUser(username, index, total) {
    try {
        const userData = await fetchGitHubUser(username);
        if (!userData || userData.message) {
            console.log(`[${index + 1}/${total}] ${username}: NOT FOUND`);
            return null;
        }

        const [commits, stars, polliPRs] = await Promise.all([
            fetchUserCommitCount(username),
            fetchUserStars(username),
            fetchPollinationsPRs(username),
        ]);

        const result = calculateScore(userData, commits, stars, polliPRs);
        console.log(
            `[${index + 1}/${total}] ${username}: ${result.total} pts → ${result.tier.toUpperCase()}`,
        );
        return result;
    } catch (err) {
        console.error(
            `[${index + 1}/${total}] ${username}: ERROR - ${err.message}`,
        );
        return null;
    }
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const usernames = readFileSync(INPUT_FILE, "utf-8")
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);

    console.log(`\n📊 Scoring ${usernames.length} spore users...\n`);
    console.log("Scoring config:");
    console.log("  GitHub age: 1 pt/month (max 6)");
    console.log("  Commits: 0.1 pt each (max 1)");
    console.log("  Public repos: 0.5 pt each (max 1)");
    console.log("  Stars: 0.1 pt each (max 1)");
    console.log("  PR to pollinations: 8 pt (max 8)");
    console.log("\nThresholds:");
    console.log("  Seed: ≥ 7 pts + GitHub age ≥ 5 months");
    console.log("  Flower: ≥ 20 pts\n");

    const results = [];
    const batchSize = 5; // Parallel requests per batch
    const delayBetweenBatches = 2000; // 2 sec to respect rate limits

    for (let i = 0; i < usernames.length; i += batchSize) {
        const batch = usernames.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map((username, j) =>
                processUser(username, i + j, usernames.length),
            ),
        );
        results.push(...batchResults.filter(Boolean));

        if (i + batchSize < usernames.length) {
            await sleep(delayBetweenBatches);
        }
    }

    // Summary
    const seedCandidates = results.filter((r) => r.tier === "seed");
    const flowerCandidates = results.filter((r) => r.tier === "flower");

    console.log("\n" + "=".repeat(50));
    console.log("📊 SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total processed: ${results.length}`);
    console.log(`Seed candidates: ${seedCandidates.length}`);
    console.log(`Flower candidates: ${flowerCandidates.length}`);
    console.log(
        `Remain spore: ${results.length - seedCandidates.length - flowerCandidates.length}`,
    );

    // Save results
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n✅ Full results saved to: ${OUTPUT_FILE}`);

    // Save seed candidates
    const seedUsernames = seedCandidates.map((r) => r.username).join("\n");
    writeFileSync(SEED_CANDIDATES_FILE, seedUsernames);
    console.log(`✅ Seed candidates saved to: ${SEED_CANDIDATES_FILE}`);

    // Top 20 seed candidates by score
    if (seedCandidates.length > 0) {
        console.log("\n🌱 Top 20 Seed Candidates:");
        seedCandidates
            .sort((a, b) => b.total - a.total)
            .slice(0, 20)
            .forEach((r, i) => {
                console.log(
                    `  ${i + 1}. ${r.username} - ${r.total} pts (age: ${r.ageMonths}mo, repos: ${r.publicRepos}, commits: ${r.commits}, stars: ${r.stars})`,
                );
            });
    }

    // Flower candidates
    if (flowerCandidates.length > 0) {
        console.log("\n🌸 Flower Candidates:");
        flowerCandidates.forEach((r) => {
            console.log(
                `  ${r.username} - ${r.total} pts (PRs: ${r.polliPRs})`,
            );
        });
    }
}

main().catch(console.error);
