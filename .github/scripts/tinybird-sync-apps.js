#!/usr/bin/env node

/**
 * Sync apps/APPS.md → Tinybird app_directory datasource.
 *
 * Atomically replaces the full table in one operation (mode=replace).
 * Runs daily via .github/workflows/tinybird-sync-apps.yml.
 *
 * Uses a single atomic replace instead of delete-all + append: the old
 * delete endpoint is an async job that returned 200 before completing, so it
 * raced the re-insert and wiped the rows it had just added — leaving the table
 * empty. mode=replace swaps the data in one step with no window of emptiness.
 *
 * Usage: node .github/scripts/tinybird-sync-apps.js
 *
 * Env vars:
 *   TINYBIRD_SYNC_TOKEN  Required — Tinybird token with DATASOURCES:CREATE on app_directory
 */

const { parseApps } = require("./lib/parse-apps.js");

const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "app_directory";
const MAX_RETRIES = 3;

const TOKEN = process.env.TINYBIRD_SYNC_TOKEN;
if (!TOKEN) {
    console.error("Error: TINYBIRD_SYNC_TOKEN env var is required");
    process.exit(1);
}

// Canonical parser fields → snake_case field names for Tinybird
const FIELD_MAP = [
    ["emoji", "emoji"],
    ["name", "name"],
    ["webUrl", "web_url"],
    ["description", "description"],
    ["language", "language"],
    ["category", "category"],
    ["platform", "platform"],
    ["githubUsername", "github_username"],
    ["githubUserId", "github_user_id"],
    ["repoUrl", "github_repository_url"],
    ["stars", "github_repository_stars"],
    ["discord", "discord_username"],
    ["other", "other"],
    ["submittedDate", "submitted_date"],
    ["issueUrl", "issue_url"],
    ["approvedDate", "approved_date"],
    ["byop", "byop"],
    ["requests24h", "requests_24h"],
];

function parseAppsMarkdown() {
    const rows = [];
    for (const app of parseApps().apps) {
        const row = {};
        for (const [field, name] of FIELD_MAP) {
            row[name] = app[field];
        }

        // Strip @ prefix from github_username
        if (row.github_username.startsWith("@")) {
            row.github_username = row.github_username.slice(1);
        }

        // Skip rows with no category and no github_user_id
        if (!row.category && !row.github_user_id) continue;

        rows.push(row);
    }
    return rows;
}

async function fetchWithRetry(url, options) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const body = await res.text();
        const retryable = res.status >= 500 || res.status === 429;

        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(`HTTP ${res.status}: ${body}`);
        }

        const delay = 200 * 2 ** (attempt - 1);
        console.log(`  Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
    }
}

async function replaceAllRows(rows) {
    const ndjson = rows.map((r) => JSON.stringify(r)).join("\n");
    console.log(`Replacing table with ${rows.length} rows (mode=replace)...`);

    const form = new FormData();
    form.append("ndjson", new Blob([ndjson]), `${DATASOURCE}.ndjson`);

    const url = `${TINYBIRD_BASE}/v0/datasources?name=${DATASOURCE}&mode=replace&format=ndjson`;
    const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: form,
    });
    // mode=replace is a job; surface its outcome rather than trusting the 200.
    const result = await res.json().catch(() => ({}));
    console.log(
        `  Accepted: ${JSON.stringify(result.error ?? result.id ?? "ok")}`,
    );
}

async function main() {
    const rows = parseAppsMarkdown();
    console.log(`Parsed ${rows.length} apps from APPS.md`);

    if (rows.length === 0) {
        console.error("Error: No apps found — refusing to sync empty table");
        process.exit(1);
    }

    await replaceAllRows(rows);

    console.log(`Synced ${rows.length} apps to Tinybird ${DATASOURCE}`);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
