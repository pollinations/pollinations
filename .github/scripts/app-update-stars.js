#!/usr/bin/env node
/**
 * Fetches GitHub stars for all repos in APPS.md and updates the Stars column.
 * Usage: node app-update-stars.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_MD_PATH = path.join(__dirname, "../../apps/APPS.md");

// Extract owner/repo from GitHub URL
function parseGitHubUrl(url) {
    if (!url) return null;
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

// Fetch stars using GitHub API
async function fetchStars(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    try {
        const response = await fetch(url, {
            headers: {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "pollinations-app-stars-updater",
                ...(process.env.GITHUB_TOKEN
                    ? { "Authorization": `token ${process.env.GITHUB_TOKEN}` }
                    : {}),
            },
        });
        if (!response.ok) {
            console.error(`  ❌ ${owner}/${repo}: ${response.status}`);
            return null;
        }
        const data = await response.json();
        return data.stargazers_count;
    } catch (err) {
        console.error(`  ❌ ${owner}/${repo}: ${err.message}`);
        return null;
    }
}

// Format star count
function formatStars(count) {
    if (count === null || count === undefined) return "";
    if (count >= 1000) return `⭐${(count / 1000).toFixed(1)}k`;
    return `⭐${count}`;
}

async function main() {
    console.log("📊 Fetching GitHub stars for APPS.md...\n");

    const content = fs.readFileSync(APPS_MD_PATH, "utf-8");
    const lines = content.split("\n");

    // Find all GitHub repos and their line numbers
    const repoLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const match = line.match(
            /https:\/\/github\.com\/([^\/\s|]+)\/([^\/\s|]+)/,
        );
        if (match) {
            repoLines.push({
                lineIndex: i,
                owner: match[1],
                repo: match[2].replace(/\.git$/, "").replace(/\)$/, ""),
                line: line,
            });
        }
    }

    console.log(`Found ${repoLines.length} repos with GitHub links\n`);

    // Fetch stars for each repo (with rate limiting)
    let updated = 0;
    for (const item of repoLines) {
        const stars = await fetchStars(item.owner, item.repo);
        if (stars !== null) {
            const formattedStars = formatStars(stars);
            console.log(`  ✅ ${item.owner}/${item.repo}: ${formattedStars}`);

            // Update the line - Stars is column 8 (0-indexed: 7)
            const columns = item.line.split("|");
            if (columns.length >= 9) {
                columns[8] = ` ${formattedStars} `;
                lines[item.lineIndex] = columns.join("|");
                updated++;
            }
        }

        // Rate limit: 100ms between requests
        await new Promise((r) => setTimeout(r, 100));
    }

    // Write updated content
    fs.writeFileSync(APPS_MD_PATH, lines.join("\n"));
    console.log(`\n✨ Updated ${updated} repos with star counts`);
}

main().catch(console.error);
