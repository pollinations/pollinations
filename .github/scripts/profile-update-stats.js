#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "pollinations";
const MAIN_REPO = "pollinations";
const GITHUB_REPO = ".github";
const PROFILE_PATH = "profile/README.md";

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

async function getOrUpdateProfileREADME(newContent) {
    const endpoint = `/repos/${ORG}/${GITHUB_REPO}/contents/${PROFILE_PATH}`;
    const token = process.env.GITHUB_TOKEN;

    try {
        // Get current file content and SHA
        const { data: fileData } = await fetchGitHubAPI(endpoint);
        const currentContent = Buffer.from(fileData.content, "base64").toString("utf-8");

        // Only update if content changed
        if (currentContent === newContent) {
            console.log("Profile README already up to date, skipping update.");
            return;
        }

        // Update file via GitHub API
        const headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "pollinations-profile-updater",
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
        };

        const response = await fetch(
            `https://api.github.com${endpoint}`,
            {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    message: "chore: update org profile stats",
                    content: Buffer.from(newContent).toString("base64"),
                    sha: fileData.sha,
                    branch: "main",
                }),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitHub API error: ${response.status} ${error}`);
        }

        console.log("Profile README updated successfully via GitHub API!");
    } catch (error) {
        if (error.message.includes("404")) {
            console.error(
                `File not found at ${PROFILE_PATH} in ${ORG}/${GITHUB_REPO}`,
            );
        } else {
            console.error("Error updating profile README:", error.message);
        }
        throw error;
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

        const linkHeader = headers.get("link");
        if (!linkHeader || !linkHeader.includes('rel="next"')) break;

        page++;
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

        // Update profile README in org repo via GitHub API
        await getOrUpdateProfileREADME(statsMarkdown);
    } catch (error) {
        console.error("Error updating stats:", error.message);
        process.exit(1);
    }
}

}
main();
