#!/usr/bin/env node
/**
 * Updates the org profile README with dynamic stats from GitHub API.
 * Run via: node .github/scripts/profile-update-stats.js
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_README = join(__dirname, "..", "profile", "README.md");
const ORG = "pollinations";
const MAIN_REPO = "pollinations";

const TIMEOUT_MS = 30000;

async function fetchGitHubAPI(endpoint) {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "pollinations-profile-updater",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`https://api.github.com${endpoint}`, {
            headers,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(
                `GitHub API error: ${response.status} ${response.statusText}`,
            );
        }
        return { data: await response.json(), headers: response.headers };
    } finally {
        clearTimeout(timeout);
    }
}

async function getRepoStats() {
    const { data: repo } = await fetchGitHubAPI(`/repos/${ORG}/${MAIN_REPO}`);
    return {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
    };
}

async function getContributorCount() {
    let total = 0;
    let page = 1;
    const perPage = 100;

    while (true) {
        const { data, headers } = await fetchGitHubAPI(
            `/repos/${ORG}/${MAIN_REPO}/contributors?per_page=${perPage}&page=${page}&anon=true`,
        );

        if (!Array.isArray(data) || data.length === 0) break;

        total += data.length;

        // Check if there are more pages via Link header
        const linkHeader = headers.get("link");
        if (!linkHeader || !linkHeader.includes('rel="next"')) break;

        page++;
        // Safety limit to prevent infinite loops
        if (page > 50) break;
    }

    return total;
}

async function getRecentActivity() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    // Get recent commits
    const { data: commits } = await fetchGitHubAPI(
        `/repos/${ORG}/${MAIN_REPO}/commits?since=${since}&per_page=100`,
    );
    const commitCount = Array.isArray(commits) ? commits.length : 0;

    // Get merged PRs (closed PRs that were merged)
    const { data: prs } = await fetchGitHubAPI(
        `/repos/${ORG}/${MAIN_REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=50`,
    );
    const mergedPRs = Array.isArray(prs)
        ? prs.filter(
              (pr) => pr.merged_at && new Date(pr.merged_at) >= thirtyDaysAgo,
          ).length
        : 0;

    return { commits: commitCount, mergedPRs };
}

function formatNumber(num) {
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
}

async function main() {
    console.log("Fetching GitHub stats...");

    try {
        const [repoStats, contributorCount, activity] = await Promise.all([
            getRepoStats(),
            getContributorCount(),
            getRecentActivity(),
        ]);

        console.log("Stats fetched:", {
            repoStats,
            contributorCount,
            activity,
        });

        // Generate stats markdown
        const statsMarkdown = `<!-- STATS:START -->
| Metric | Count |
|--------|-------|
| ⭐ **Stars** | ${formatNumber(repoStats.stars)} |
| 🍴 **Forks** | ${formatNumber(repoStats.forks)} |
| 👥 **Contributors** | ${contributorCount}+ |
| 🔀 **Merged PRs (30d)** | ${activity.mergedPRs} |
| 📝 **Commits (30d)** | ${activity.commits}+ |
<!-- STATS:END -->`;

        // Read current README
        let readme = readFileSync(PROFILE_README, "utf-8");

        // Replace stats section
        const statsRegex = /<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/;
        if (statsRegex.test(readme)) {
            readme = readme.replace(statsRegex, statsMarkdown);
            writeFileSync(PROFILE_README, readme);
            console.log("Profile README updated successfully!");
        } else {
            console.log("Stats markers not found in README, skipping update.");
        }
    } catch (error) {
        console.error("Error updating stats:", error.message);
        process.exit(1);
    }
}

main();
