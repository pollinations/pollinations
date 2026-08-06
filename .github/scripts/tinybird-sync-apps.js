#!/usr/bin/env node

/**
 * Sync apps/catalog.json → Tinybird app_directory datasource.
 *
 * Atomically replaces the full table in one operation (mode=replace).
 * Runs daily via .github/workflows/data-sync-app-catalog-tinybird.yml.
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

const { readApps } = require("./lib/app-catalog.js");

const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "app_directory";
const MAX_RETRIES = 3;

const TOKEN = process.env.TINYBIRD_SYNC_TOKEN;
if (!TOKEN) {
    console.error("Error: TINYBIRD_SYNC_TOKEN env var is required");
    process.exit(1);
}

function catalogRows() {
    const rows = [];
    for (const app of readApps()) {
        const row = {
            emoji: app.emoji,
            name: app.name,
            web_url: app.url || "",
            description: app.description,
            language: app.language || "",
            category: app.category,
            platform: app.platform,
            github_username: app.githubUsername || "",
            github_user_id: app.githubUserId || "",
            github_repository_url: app.repositoryUrl || "",
            github_repository_stars:
                app.repositoryStars === null ? "" : `⭐${app.repositoryStars}`,
            discord_username: app.discordUsername || "",
            other: app.other || "",
            submitted_date: app.submittedDate || "",
            issue_url: app.issueUrl || "",
            approved_date: app.approvedDate || "",
            byop: app.byop ? "true" : "",
            requests_24h: app.requests24h ? String(app.requests24h) : "",
        };

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
    const rows = catalogRows();
    console.log(`Parsed ${rows.length} apps from catalog.json`);

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
