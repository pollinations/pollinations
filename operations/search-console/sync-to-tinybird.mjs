#!/usr/bin/env node

/**
 * Sync Google Search Console performance for sc-domain:pollinations.ai (all
 * subdomains) → Tinybird search_console_raw.
 *
 * Search Console keeps 16 months, so this runs daily
 * (.github/workflows/data-sync-search-console-tinybird.yml) and stores the API
 * responses unchanged. Each run fetches the latest days with final data, so
 * days are sent again: consumers select the latest fetched_at per dataset and
 * date.
 *
 *   totals   clicks, impressions, CTR, position by country and device: the
 *            true totals, including queries Google hides for privacy
 *   queries  the same by search query, country and device
 *   pages    the same by page, country and device, for our own page routes
 *            only: Google indexes image URLs that contain prompts
 *
 * Days are Search Console days (Pacific time); countries are ISO alpha-3. A
 * report over 25,000 rows spans several responses (start_row).
 *
 * Usage: node operations/search-console/sync-to-tinybird.mjs [--days 3] [--dry-run]
 *
 * --days syncs the latest N final days (1–7, for a missed run).
 *
 * Env vars:
 *   GOOGLE_ACCESS_TOKEN  Required — OAuth token with webmasters.readonly for a user of the property
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { parseArgs } from "node:util";

const SITE = "sc-domain:pollinations.ai";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "search_console_raw";
const MAX_DAYS = 7;
const ROW_LIMIT = 25000;

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

async function searchAnalytics(request) {
    const res = await fetch(
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
                rowLimit: ROW_LIMIT,
                ...request,
            }),
        },
    );
    const body = await res.text();
    if (!res.ok) throw new Error(`Search Console HTTP ${res.status} ${body}`);
    return { body, rows: JSON.parse(body).rows ?? [] };
}

// Final data usually lags two to three days; ask which days are final instead
// of guessing the delay.
async function finalDays(days) {
    const { rows } = await searchAnalytics({
        startDate: daysAgo(days + 7),
        endDate: daysAgo(0),
        dimensions: ["date"],
    });
    return rows
        .map((row) => row.keys[0])
        .sort()
        .slice(-days);
}

async function report(date, request) {
    const pages = [];
    for (let start_row = 0; ; start_row += ROW_LIMIT) {
        const page = await searchAnalytics({
            startDate: date,
            endDate: date,
            startRow: start_row,
            ...request,
        });
        pages.push({ start_row, ...page });
        if (page.rows.length < ROW_LIMIT) return pages;
    }
}

async function append(rows) {
    const res = await fetch(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.TINYBIRD_SYNC_TOKEN}`,
            },
            body: rows.map((row) => JSON.stringify(row)).join("\n"),
        },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`Tinybird HTTP ${res.status} ${text}`);
    const { successful_rows, quarantined_rows } = JSON.parse(text);
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
    if (dates.length === 0) throw new Error("No final days returned");
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
