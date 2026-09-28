#!/usr/bin/env node

/**
 * Sync Google Search Console performance for sc-domain:pollinations.ai (all
 * subdomains) → Tinybird search_console_raw.
 *
 * Search Console keeps 16 months, so this runs daily
 * (.github/workflows/data-sync-search-console-tinybird.yml) and stores the API
 * responses unchanged. Each run fetches the most recent days with final data
 * (three by default); days sent again are expected. Every response of a run
 * shares one fetched_at and carries the report's page_count: the newest
 * fetched_at of a dataset and date whose distinct start_rows number page_count
 * is one complete report. Tinybird can accept some rows of a request and
 * quarantine others, so an upload alone does not prove completeness.
 *
 *   totals   clicks, impressions, CTR, position by country and device: the
 *            true totals, including queries Google hides for privacy
 *   queries  the same by search query, country and device
 *   pages    the same by page, country and device, for our own page routes
 *            only: Google indexes image URLs that contain prompts
 *
 * Days are Search Console days (Pacific time); countries are ISO alpha-3.
 * Google returns at most 50,000 rows per day and dataset, 25,000 per request,
 * so a report can take two responses (start_row); detail beyond that cap is
 * not available from Google at all.
 *
 * Usage: node operations/search-console/sync-to-tinybird.mjs [--days 3] [--dry-run]
 *
 * Env vars:
 *   GOOGLE_ACCESS_TOKEN  Required — OAuth token with webmasters.readonly for a user of the property
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { parseArgs } from "node:util";

const SITE = "sc-domain:pollinations.ai";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "search_console_raw";
const MAX_DAYS = 486; // 16 months
const ROW_LIMIT = 25000;
const GOOGLE_DAY_CAP = 50000;
const MAX_RETRIES = 3;

// Page routes of pollinations.ai/src/App.tsx and of the enter page list in
// shared/product-analytics.ts, as in the Cloudflare sync.
const PAGES = {
    "pollinations.ai": [
        "/",
        "/play",
        "/apps",
        "/community",
        "/docs",
        "/terms",
        "/privacy",
        "/refunds",
    ],
    "enter.pollinations.ai": [
        "/",
        "/top-up",
        "/sign-in",
        "/app/sign-in",
        "/authorize",
        "/device",
        "/edit-key",
        "/error",
        "/privacy",
        "/terms",
        "/refunds",
        "/news",
        "/pollen",
        "/keys",
        "/models",
        "/my-models",
        "/quests",
        "/activity",
        "/account",
    ],
};
PAGES["www.pollinations.ai"] = PAGES["pollinations.ai"];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OWN_PAGES = Object.entries(PAGES)
    .map(
        ([host, paths]) =>
            `^https://${escapeRegex(host)}(${paths.map(escapeRegex).join("|")})/?$`,
    )
    .join("|");

const DATASETS = {
    totals: { dimensions: ["country", "device"] },
    queries: { dimensions: ["query", "country", "device"] },
    pages: {
        dimensions: ["page", "country", "device"],
        dimensionFilterGroups: [
            {
                filters: [
                    {
                        dimension: "page",
                        operator: "includingRegex",
                        expression: OWN_PAGES,
                    },
                ],
            },
        ],
    },
};

const { values: args } = parseArgs({
    options: {
        days: { type: "string", default: "3" },
        "dry-run": { type: "boolean", default: false },
    },
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

// Returns the body and its rows; an error envelope is never stored as data.
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
    const body = await res.text();
    const data = JSON.parse(body);
    if (data.error || typeof data.responseAggregationType !== "string") {
        throw new Error(`unexpected response ${body.slice(0, 200)}`);
    }
    return { body, rows: data.rows ?? [] };
}

// Final data usually lags two to three days; ask which days are final instead
// of guessing the delay.
async function finalDays(days) {
    const { rows } = await searchAnalytics({
        startDate: daysAgo(days + 7),
        endDate: daysAgo(0),
        dimensions: ["date"],
        rowLimit: ROW_LIMIT,
    });
    return rows
        .map((row) => row.keys[0])
        .sort()
        .slice(-days);
}

// All pages of one report, fetched before any is stored.
async function report(date, { dimensions, dimensionFilterGroups }) {
    const pages = [];
    for (let startRow = 0; ; startRow += ROW_LIMIT) {
        const page = await searchAnalytics({
            startDate: date,
            endDate: date,
            dimensions,
            dimensionFilterGroups,
            rowLimit: ROW_LIMIT,
            startRow,
        });
        pages.push({ start_row: startRow, ...page });
        if (page.rows.length < ROW_LIMIT) return pages;
        if (startRow + ROW_LIMIT >= GOOGLE_DAY_CAP) {
            console.log(
                `::warning::${date} ${dimensions.join(",")} reached Google's ${GOOGLE_DAY_CAP}-row daily cap; less frequent rows are not available`,
            );
            return pages;
        }
    }
}

async function append(rows) {
    const res = await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.TINYBIRD_SYNC_TOKEN}`,
            },
            body: rows.map((row) => JSON.stringify(row)).join("\n"),
        },
    );
    const { successful_rows, quarantined_rows } = await res.json();
    if (successful_rows !== rows.length || quarantined_rows > 0) {
        throw new Error(
            `${rows[0].dataset} ${rows[0].date}: ${successful_rows}/${rows.length} rows ingested, ${quarantined_rows} quarantined`,
        );
    }
}

async function main() {
    const days = Number(args.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        throw new Error(
            `--days must be a whole number from 1 to ${MAX_DAYS}, got ${args.days}`,
        );
    }
    if (!process.env.GOOGLE_ACCESS_TOKEN) {
        throw new Error("GOOGLE_ACCESS_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    const fetched_at = toDateTime(new Date());
    const dates = await finalDays(days);
    if (dates.length === 0) {
        throw new Error("No final days returned — refusing to sync");
    }
    for (const date of dates) {
        for (const [dataset, request] of Object.entries(DATASETS)) {
            const pages = await report(date, request);
            for (const page of pages) {
                console.log(
                    `${date} ${dataset} from ${page.start_row}: ${page.rows.length} rows, ${page.body.length} bytes`,
                );
            }
            if (!args["dry-run"]) {
                await append(
                    pages.map(({ start_row, body }) => ({
                        dataset,
                        date,
                        start_row,
                        page_count: pages.length,
                        fetched_at,
                        body,
                    })),
                );
            }
        }
    }
    console.log(
        `${dates.length} days ${args["dry-run"] ? "read" : `appended to ${DATASOURCE}`}`,
    );
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
