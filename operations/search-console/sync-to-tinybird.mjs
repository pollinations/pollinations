#!/usr/bin/env node

/**
 * Sync Google Search Console performance for sc-domain:pollinations.ai (all
 * subdomains) → Tinybird search_console_raw.
 *
 * Search Console keeps 16 months, so this runs daily
 * (.github/workflows/data-sync-search-console-tinybird.yml) and stores the API
 * responses unchanged. Each run fetches the three most recent days with final
 * data; days sent again are expected, the latest fetch of a day wins.
 *
 *   totals   clicks, impressions, CTR, position by country and device: the
 *            true totals, including queries Google hides for privacy
 *   queries  the same by search query, country and device
 *   pages    the same by page, country and device
 *
 * Google returns at most 50,000 rows per day and dataset, 25,000 per request,
 * so a dataset can take two responses; start_row tells them apart.
 *
 * Usage: node operations/search-console/sync-to-tinybird.mjs [--dry-run]
 *
 * Env vars:
 *   GOOGLE_ACCESS_TOKEN  Required — OAuth token with webmasters.readonly for a user of the property
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { parseArgs } from "node:util";

const SITE = "sc-domain:pollinations.ai";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "search_console_raw";
const DAYS = 3;
const ROW_LIMIT = 25000;
const MAX_RETRIES = 3;

const DATASETS = {
    totals: ["country", "device"],
    queries: ["query", "country", "device"],
    pages: ["page", "country", "device"],
};

const { values: args } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
});

const toDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const daysAgo = (n) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function fetchWithRetry(url, options) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const body = await res.text();
        const retryable = res.status >= 500 || res.status === 429;
        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(`HTTP ${res.status} ${url}: ${body}`);
        }
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
}

async function searchAnalytics(request) {
    const res = await fetchWithRetry(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                type: "web",
                dataState: "final",
                ...request,
            }),
        },
    );
    return res.text();
}

// Final data usually lags two to three days; ask which days are final instead
// of guessing the delay.
async function finalDays() {
    const body = await searchAnalytics({
        startDate: daysAgo(10),
        endDate: daysAgo(0),
        dimensions: ["date"],
    });
    return (JSON.parse(body).rows ?? [])
        .map((row) => row.keys[0])
        .sort()
        .slice(-DAYS);
}

async function* responses() {
    for (const date of await finalDays()) {
        for (const [dataset, dimensions] of Object.entries(DATASETS)) {
            for (let startRow = 0; ; startRow += ROW_LIMIT) {
                const body = await searchAnalytics({
                    startDate: date,
                    endDate: date,
                    dimensions,
                    rowLimit: ROW_LIMIT,
                    startRow,
                });
                const rows = JSON.parse(body).rows ?? [];
                yield {
                    dataset,
                    date,
                    start_row: startRow,
                    body,
                    rows: rows.length,
                };
                if (rows.length < ROW_LIMIT) break;
            }
        }
    }
}

async function append(row) {
    const res = await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.TINYBIRD_SYNC_TOKEN}`,
            },
            body: JSON.stringify(row),
        },
    );
    const { successful_rows, quarantined_rows } = await res.json();
    if (successful_rows !== 1 || quarantined_rows > 0) {
        throw new Error(
            `${row.dataset} ${row.date} ${row.start_row}: ${quarantined_rows} rows quarantined`,
        );
    }
}

async function main() {
    if (!process.env.GOOGLE_ACCESS_TOKEN) {
        throw new Error("GOOGLE_ACCESS_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    let count = 0;
    for await (const { rows, ...row } of responses()) {
        console.log(
            `${row.date} ${row.dataset} from ${row.start_row}: ${rows} rows, ${row.body.length} bytes`,
        );
        if (!args["dry-run"]) {
            await append({ ...row, fetched_at: toDateTime(new Date()) });
        }
        count++;
    }
    if (count === 0)
        throw new Error("No final days returned — refusing to sync");
    console.log(
        `${count} responses ${args["dry-run"] ? "read" : `appended to ${DATASOURCE}`}`,
    );
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
