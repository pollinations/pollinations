#!/usr/bin/env node

/**
 * Export the history of the GA4 property of the former pollinations.ai tag
 * (G-LPZ9GEJVHR, property 277369924) → Tinybird ga_raw.
 *
 * The property lives in the Google Workspace that is being retired, so this
 * copies its reports once, month by month, and stores the Data API responses
 * unchanged. Run by hand (.github/workflows/data-export-ga-history-tinybird.yml);
 * running it again re-sends every month. Every response of a run shares one
 * fetched_at and carries GA's row_count, so the latest fetched_at of a dataset
 * and month is one report whose completeness can be checked.
 *
 *   traffic  sessions, users, new users, page views, engaged sessions by day,
 *            source, medium, campaign, country and device
 *   hosts    sessions, users, page views by day, site and country
 *
 * A day is included once 48 hours have passed since it ended in any timezone
 * (GA takes 24–48 hours to process a day): run the final copy after the last
 * collected day has cleared that.
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
// A traffic row is ~600 bytes of JSON; 10,000 rows (~6 MB) stay under
// Tinybird's 10 MB per Events request. The largest month so far is 18,405 rows.
const ROW_LIMIT = 10000;
// A day ends at most 12 hours after its UTC midnight (UTC-12); adding GA's
// 48-hour processing gives 60 hours after the next UTC midnight, so the last
// settled day is the UTC date 84 hours ago.
const SETTLED_HOURS = 84;
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
const toDate = (d) => d.toISOString().slice(0, 10);

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

// Calendar months from `from` (YYYY-MM) up to the last settled day.
function months(from) {
    const last = new Date(
        `${toDate(new Date(Date.now() - SETTLED_HOURS * 3_600_000))}T00:00:00Z`,
    );
    const ranges = [];
    for (
        let d = new Date(`${from}-01T00:00:00Z`);
        d <= last;
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
        const end = new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
        );
        ranges.push({
            start_date: toDate(d),
            end_date: toDate(end < last ? end : last),
        });
    }
    return ranges;
}

// Returns the body and its parsed data; an error envelope is never stored.
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
    const body = await res.text();
    const data = JSON.parse(body);
    if (data.error || data.kind !== "analyticsData#runReport") {
        throw new Error(`unexpected response ${body.slice(0, 200)}`);
    }
    return { body, data };
}

// GA reports where it collapsed or sampled data; fetching more pages cannot
// recover it, so it is surfaced instead of failing the whole export.
function warnOnDataLoss(label, { metadata = {} }) {
    const reasons = [
        metadata.dataLossFromOtherRow && "rows collapsed into (other)",
        metadata.samplingMetadatas?.length && "sampled",
        metadata.subjectToThresholding && "thresholded",
        metadata.dataTruncationReasons?.length &&
            `truncated (${metadata.dataTruncationReasons.join(", ")})`,
    ].filter(Boolean);
    if (reasons.length > 0) {
        console.log(`::warning::${label}: ${reasons.join(", ")}`);
    }
}

// All pages of one report, fetched before any is stored. An empty report is
// kept too, so it supersedes an older non-empty one.
async function report(range, { dimensions, metrics }) {
    const pages = [];
    for (let offset = 0; ; offset += ROW_LIMIT) {
        const { body, data } = await runReport({
            dateRanges: [
                { startDate: range.start_date, endDate: range.end_date },
            ],
            dimensions: dimensions.map((name) => ({ name })),
            metrics: metrics.map((name) => ({ name })),
            limit: ROW_LIMIT,
            offset,
            keepEmptyRows: false,
        });
        const rowCount = data.rowCount ?? 0;
        pages.push({
            start_row: offset,
            row_count: rowCount,
            body,
            rows: data.rows?.length ?? 0,
            data,
        });
        if (offset + ROW_LIMIT >= rowCount) return pages;
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

    const fetched_at = toDateTime(new Date());
    let rowsTotal = 0;
    for (const range of months(args.from)) {
        for (const [dataset, request] of Object.entries(DATASETS)) {
            const pages = await report(range, request);
            for (const { start_row, row_count, body, rows, data } of pages) {
                const label = `${range.start_date} ${dataset} from ${start_row}`;
                console.log(
                    `${label}: ${rows} of ${row_count} rows, ${body.length} bytes`,
                );
                warnOnDataLoss(label, data);
                rowsTotal += rows;
                if (!args["dry-run"]) {
                    await append({
                        dataset,
                        ...range,
                        start_row,
                        row_count,
                        fetched_at,
                        body,
                    });
                }
            }
        }
    }
    if (rowsTotal === 0) {
        throw new Error("No GA data returned — refusing to finish");
    }
    console.log(
        `${rowsTotal} rows ${args["dry-run"] ? "read" : `appended to ${DATASOURCE}`}`,
    );
}

main().catch((err) => {
    console.error("Export failed:", err.message);
    process.exit(1);
});
