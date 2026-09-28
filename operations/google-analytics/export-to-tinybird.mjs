#!/usr/bin/env node

/**
 * Export the history of the GA4 property of the former pollinations.ai tag
 * (G-LPZ9GEJVHR, property 277369924) → Tinybird ga_raw.
 *
 * The property lives in the Google Workspace that is being retired, so this
 * copies its reports once, month by month, and stores the Data API responses
 * unchanged. Run by hand (.github/workflows/data-export-ga-history-tinybird.yml);
 * running it again re-sends every month, the latest fetch wins.
 *
 *   traffic  sessions, users, new users, page views, engaged sessions by day,
 *            source, medium, campaign, country and device
 *   hosts    sessions, users, page views by day, site and country
 *
 * No page path or title is requested: the old site put prompts in URLs.
 *
 * Usage: node operations/google-analytics/export-to-tinybird.mjs [--from 2021-01] [--dry-run]
 *
 * Env vars:
 *   GOOGLE_ACCESS_TOKEN  Required — OAuth token with analytics.readonly for a viewer of the property
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { parseArgs } from "node:util";

const PROPERTY = "277369924";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "ga_raw";
const ROW_LIMIT = 50000;
const MAX_RETRIES = 3;

const DATASETS = {
    traffic: {
        dimensions: [
            "date",
            "sessionSource",
            "sessionMedium",
            "sessionCampaignName",
            "country",
            "deviceCategory",
        ],
        metrics: [
            "sessions",
            "activeUsers",
            "newUsers",
            "screenPageViews",
            "engagedSessions",
        ],
    },
    hosts: {
        dimensions: ["date", "hostName", "country"],
        metrics: ["sessions", "activeUsers", "screenPageViews"],
    },
};

const { values: args } = parseArgs({
    options: {
        from: { type: "string", default: "2021-01" },
        "dry-run": { type: "boolean", default: false },
    },
});

const toDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");

async function fetchWithRetry(url, options) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const body = await res.text();
        const retryable = res.status >= 500 || res.status === 429;
        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(`HTTP ${res.status} ${url}: ${body}`);
        }
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
}

// Calendar months from `from` (YYYY-MM) to the current month, as date ranges.
function months(from) {
    const ranges = [];
    const now = new Date();
    for (
        let d = new Date(`${from}-01T00:00:00Z`);
        d <= now;
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
        const end = new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
        );
        ranges.push({
            start_date: d.toISOString().slice(0, 10),
            end_date: (end < now ? end : now).toISOString().slice(0, 10),
        });
    }
    return ranges;
}

async function runReport(request) {
    const res = await fetchWithRetry(
        `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        },
    );
    return res.text();
}

async function* responses() {
    for (const range of months(args.from)) {
        for (const [dataset, { dimensions, metrics }] of Object.entries(
            DATASETS,
        )) {
            for (let offset = 0; ; offset += ROW_LIMIT) {
                const body = await runReport({
                    dateRanges: [
                        {
                            startDate: range.start_date,
                            endDate: range.end_date,
                        },
                    ],
                    dimensions: dimensions.map((name) => ({ name })),
                    metrics: metrics.map((name) => ({ name })),
                    limit: ROW_LIMIT,
                    offset,
                    keepEmptyRows: false,
                });
                const { rowCount = 0, rows = [] } = JSON.parse(body);
                if (rowCount === 0) break;
                yield {
                    dataset,
                    ...range,
                    start_row: offset,
                    body,
                    rows: rows.length,
                };
                if (offset + ROW_LIMIT >= rowCount) break;
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
            `${row.dataset} ${row.start_date} ${row.start_row}: ${quarantined_rows} rows quarantined`,
        );
    }
}

async function main() {
    if (!/^\d{4}-\d{2}$/.test(args.from)) {
        throw new Error(`--from must be YYYY-MM, got ${args.from}`);
    }
    if (!process.env.GOOGLE_ACCESS_TOKEN) {
        throw new Error("GOOGLE_ACCESS_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    let count = 0;
    for await (const { rows, ...row } of responses()) {
        console.log(
            `${row.start_date} ${row.dataset} from ${row.start_row}: ${rows} rows, ${row.body.length} bytes`,
        );
        if (!args["dry-run"]) {
            await append({ ...row, fetched_at: toDateTime(new Date()) });
        }
        count++;
    }
    if (count === 0)
        throw new Error("No GA data returned — refusing to finish");
    console.log(
        `${count} responses ${args["dry-run"] ? "read" : `appended to ${DATASOURCE}`}`,
    );
}

main().catch((err) => {
    console.error("Export failed:", err.message);
    process.exit(1);
});
