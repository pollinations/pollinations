#!/usr/bin/env node

/**
 * Sync apps/APPS.md → Tinybird app_directory datasource.
 *
 * Deletes all existing rows and re-inserts the full table.
 * Runs daily via .github/workflows/tinybird-sync-apps.yml.
 *
 * Usage: node .github/scripts/tinybird-sync-apps.js
 *
 * Env vars:
 *   TINYBIRD_APP_SYNC_TOKEN  Required — Tinybird token with append+delete on app_directory
 */

const fs = require("node:fs");
const path = require("node:path");

const APPS_FILE = path.resolve(__dirname, "../../apps/APPS.md");
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "app_directory";
const MAX_RETRIES = 3;

const TOKEN = process.env.TINYBIRD_APP_SYNC_TOKEN;
if (!TOKEN) {
    console.error("Error: TINYBIRD_APP_SYNC_TOKEN env var is required");
    process.exit(1);
}

// Column names in APPS.md → snake_case field names for Tinybird
const COLUMN_MAP = [
    ["Emoji", "emoji"],
    ["Name", "name"],
    ["Web_URL", "web_url"],
    ["Description", "description"],
    ["Language", "language"],
    ["Category", "category"],
    ["Platform", "platform"],
    ["GitHub_Username", "github_username"],
    ["GitHub_UserID", "github_user_id"],
    ["Github_Repository_URL", "github_repository_url"],
    ["Github_Repository_Stars", "github_repository_stars"],
    ["Discord_Username", "discord_username"],
    ["Other", "other"],
    ["Submitted_Date", "submitted_date"],
    ["Issue_URL", "issue_url"],
    ["Approved_Date", "approved_date"],
    ["BYOP", "byop"],
    ["Requests_24h", "requests_24h"],
    ["Health", "health"],
];

function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    const headers = lines[headerIdx].split("|").map((h) => h.trim());

    // Build column index map: header name → position
    const colIndex = {};
    for (const [mdName] of COLUMN_MAP) {
        const idx = headers.findIndex(
            (h) => h.toLowerCase() === mdName.toLowerCase(),
        );
        if (idx === -1) {
            console.warn(
                `Warning: column "${mdName}" not found in APPS.md header`,
            );
        }
        colIndex[mdName] = idx;
    }

    const rows = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|").map((c) => c.trim());

        const row = {};
        for (const [mdName, fieldName] of COLUMN_MAP) {
            const idx = colIndex[mdName];
            row[fieldName] = idx !== -1 && idx < cols.length ? cols[idx] : "";
        }

        // Strip @ prefix from github_username
        if (row.github_username.startsWith("@")) {
            row.github_username = row.github_username.slice(1);
        }

        // Skip rows with no category or no github_user_id
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

async function deleteAllRows() {
    console.log("Deleting all existing rows...");
    await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/datasources/${DATASOURCE}/delete`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "delete_condition=1%3D1",
        },
    );
    console.log("  Done.");
}

async function insertRows(rows) {
    const ndjson = rows.map((r) => JSON.stringify(r)).join("\n");
    console.log(`Inserting ${rows.length} rows...`);
    await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/x-ndjson",
            },
            body: ndjson,
        },
    );
    console.log("  Done.");
}

async function main() {
    const rows = parseAppsMarkdown();
    console.log(`Parsed ${rows.length} apps from APPS.md`);

    if (rows.length === 0) {
        console.error("Error: No apps found — refusing to sync empty table");
        process.exit(1);
    }

    await deleteAllRows();
    await insertRows(rows);

    console.log(`Synced ${rows.length} apps to Tinybird ${DATASOURCE}`);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
