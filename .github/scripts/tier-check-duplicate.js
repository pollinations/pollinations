#!/usr/bin/env node

/**
 * Check for duplicate app submissions in APPS.md
 *
 * This script replaces fragile bash string parsing that breaks on special characters
 * (single quotes, double quotes, backticks, dollar signs, etc.)
 *
 * Usage: node tier-check-duplicate.js
 *
 * Environment variables:
 *   PROJECT_JSON - JSON string with app submission data (name, url, repo, description)
 *   GITHUB_USERNAME - GitHub username of the submitter
 *
 * Output (to GITHUB_OUTPUT):
 *   duplicate_found - file where duplicate was found (empty if none)
 *   match_type - type of match: url_exact, repo_exact, name_user_exact
 *   similarity_score - semantic similarity score (0-100)
 *   similarity_reason - explanation of similarity
 *   user_previous_apps - JSON array of user's previous app submissions
 */

const fs = require("fs");

// Parse environment variables
const projectJson = process.env.PROJECT_JSON;
const githubUsername = process.env.GITHUB_USERNAME;
const githubOutput = process.env.GITHUB_OUTPUT;

if (!projectJson) {
    console.error("Error: PROJECT_JSON environment variable is required");
    process.exit(1);
}

if (!githubUsername) {
    console.error("Error: GITHUB_USERNAME environment variable is required");
    process.exit(1);
}

let project;
try {
    project = JSON.parse(projectJson);
} catch (e) {
    console.error("Error: Invalid PROJECT_JSON:", e.message);
    process.exit(1);
}

const appName = project.name || "";
const appUrl = project.url || "";
const appRepo = project.repo || "";

/**
 * Parse APPS.md markdown table into structured data
 * Handles special characters safely (no shell parsing)
 */
function parseAppsMarkdown(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    // Find header row
    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        return [];
    }

    // Parse data rows (skip header and separator)
    const apps = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        // Split by pipe, handling content that may contain special chars
        const cols = line.split("|").map((c) => c.trim());
        // Remove first and last empty strings from split
        cols.shift();
        cols.pop();

        if (cols.length < 6) continue;

        // cols: [emoji, name, desc, language, category, github, repo, stars, discord, other, submitted]
        const [
            emoji,
            name,
            desc,
            language,
            category,
            github,
            repo,
            stars,
            discord,
            other,
            submitted,
        ] = cols;

        // Extract clean name and URL from markdown link format: [Name](url)
        let cleanName = name;
        let url = "";
        const linkMatch = name.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
            cleanName = linkMatch[1];
            url = linkMatch[2];
        }

        apps.push({
            emoji,
            name: cleanName,
            nameRaw: name,
            url,
            desc,
            language,
            category,
            github: github.replace(/^@/, ""),
            repo,
            stars,
            discord,
            other,
            submitted,
        });
    }

    return apps;
}

/**
 * Check for exact URL match
 */
function checkUrlMatch(apps, targetUrl) {
    if (!targetUrl) return null;
    const normalizedTarget = targetUrl.toLowerCase().replace(/\/$/, "");
    return apps.find((app) => {
        const normalizedApp = (app.url || "").toLowerCase().replace(/\/$/, "");
        return normalizedApp === normalizedTarget;
    });
}

/**
 * Check for exact repo match
 */
function checkRepoMatch(apps, targetRepo) {
    if (!targetRepo) return null;
    const normalizedTarget = targetRepo
        .toLowerCase()
        .replace(/\/$/, "")
        .replace(/\.git$/, "");
    return apps.find((app) => {
        const normalizedApp = (app.repo || "")
            .toLowerCase()
            .replace(/\/$/, "")
            .replace(/\.git$/, "");
        return normalizedApp && normalizedApp === normalizedTarget;
    });
}

/**
 * Check for name + user match
 */
function checkNameUserMatch(apps, targetName, username) {
    const normalizedTarget = targetName
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim();
    return apps.find((app) => {
        const normalizedApp = app.name
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .trim();
        return (
            normalizedApp === normalizedTarget &&
            app.github.toLowerCase() === username.toLowerCase()
        );
    });
}

/**
 * Get user's previous submissions
 */
function getUserPreviousApps(apps, username) {
    return apps.filter(
        (app) => app.github.toLowerCase() === username.toLowerCase(),
    );
}

/**
 * Write output to GITHUB_OUTPUT file
 */
function writeOutput(key, value) {
    if (!githubOutput) {
        console.log(`${key}=${value}`);
        return;
    }

    // Handle multiline values with EOF delimiter
    if (value.includes("\n")) {
        fs.appendFileSync(githubOutput, `${key}<<EOF\n${value}\nEOF\n`);
    } else {
        fs.appendFileSync(githubOutput, `${key}=${value}\n`);
    }
}

// Main logic
const appsFile = "apps/APPS.md";
const apps = parseAppsMarkdown(appsFile);

console.log(`Parsed ${apps.length} apps from ${appsFile}`);
console.log(`Checking submission: "${appName}" by @${githubUsername}`);

let duplicateFound = "";
let matchType = "";

// 1. Check for exact URL match (HARD MATCH)
const urlMatch = checkUrlMatch(apps, appUrl);
if (urlMatch) {
    duplicateFound = appsFile;
    matchType = "url_exact";
    console.log(`❌ URL match found: ${urlMatch.name}`);
}

// 2. Check for exact repo match (HARD MATCH)
if (!duplicateFound && appRepo) {
    const repoMatch = checkRepoMatch(apps, appRepo);
    if (repoMatch) {
        duplicateFound = appsFile;
        matchType = "repo_exact";
        console.log(`❌ Repo match found: ${repoMatch.name}`);
    }
}

// 3. Check for name + user match (HARD MATCH)
if (!duplicateFound) {
    const nameUserMatch = checkNameUserMatch(apps, appName, githubUsername);
    if (nameUserMatch) {
        duplicateFound = appsFile;
        matchType = "name_user_exact";
        console.log(`❌ Name+User match found: ${nameUserMatch.name}`);
    }
}

// Output results
writeOutput("duplicate_found", duplicateFound);
writeOutput("match_type", matchType);

// Get user's previous apps for semantic similarity check (done externally via API)
const userPreviousApps = getUserPreviousApps(apps, githubUsername);
if (userPreviousApps.length > 0 && !duplicateFound) {
    console.log(
        `Found ${userPreviousApps.length} previous apps by @${githubUsername}`,
    );

    // Format for semantic comparison
    const prevAppsText = userPreviousApps
        .map((app) => `Name: ${app.name} | Desc: ${app.desc}`)
        .join("\n");

    writeOutput("user_previous_apps", prevAppsText);
} else {
    writeOutput("user_previous_apps", "");
}

// Default similarity values (semantic check done separately via API call)
writeOutput("similarity_score", "0");

console.log("✅ Duplicate check complete");
