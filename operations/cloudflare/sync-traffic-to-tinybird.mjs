#!/usr/bin/env node

/**
 * Sync Cloudflare page traffic for pollinations.ai and enter.pollinations.ai
 * → Tinybird cloudflare_traffic_raw.
 *
 * The zone is on the Free plan, where per-request detail (page, country,
 * device) is kept for 30 days only, so this runs daily
 * (.github/workflows/data-sync-cloudflare-traffic-tinybird.yml) and stores one
 * raw GraphQL response per UTC day; the cloudflare_page_views_daily pipe
 * interprets it.
 *
 * Only HTML responses to real clients on our own page routes are requested:
 * people type prompts into URLs, so any other path may contain prompt text.
 * No IP or user-agent string is requested. Verified bots stay in, labelled by
 * verifiedBotCategory.
 *
 * Usage:
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs [--days 1] [--dry-run]
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs --save <dir> [--days 30]
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs --snapshot <dir> [--dry-run]
 *
 * --days fetches the last N complete UTC days (up to 30 for backfill); --save
 * writes each day's response to <dir>/<date>.json without ingesting;
 * --snapshot ingests those files later, using each file's mtime as fetched_at.
 *
 * Env vars:
 *   CLOUDFLARE_API_TOKEN  Required unless --snapshot — Analytics read on the pollinations.ai zone
 *   TINYBIRD_SYNC_TOKEN   Required unless --dry-run or --save
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const ZONE_ID = "1815735e6400a65d924e0e9f9eb6e18a"; // pollinations.ai
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "cloudflare_traffic_raw";
const DATASET = "page_views";
const LIMIT = 10000;
const MAX_RETRIES = 3;

// Page routes of pollinations.ai/src/App.tsx and of the enter page list in
// shared/product-analytics.ts.
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

const QUERY = `query ($zone: String!, $date: Date!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: ${LIMIT}, filter: $filter) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { date clientRequestHTTPHost clientRequestPath clientCountryName clientDeviceType userAgentBrowser verifiedBotCategory }
    }
  } }
}`;

const { values: args } = parseArgs({
    options: {
        days: { type: "string", default: "1" },
        save: { type: "string" },
        snapshot: { type: "string" },
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
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
}

// Complete UTC days, newest first: yesterday back to `days` days ago.
function lastDays(days) {
    const today = Date.parse(new Date().toISOString().slice(0, 10));
    return Array.from({ length: days }, (_, i) =>
        new Date(today - (i + 1) * 86_400_000).toISOString().slice(0, 10),
    );
}

async function fetchDay(date) {
    const filter = {
        date,
        requestSource: "eyeball",
        edgeResponseContentTypeName: "html",
        OR: Object.entries(PAGES).map(([host, paths]) => ({
            clientRequestHTTPHost: host,
            clientRequestPath_in: paths,
        })),
    };
    const res = await fetchWithRetry(
        "https://api.cloudflare.com/client/v4/graphql",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: QUERY,
                variables: { zone: ZONE_ID, date, filter },
            }),
        },
    );
    const body = await res.text();
    const { data, errors } = JSON.parse(body);
    if (errors) throw new Error(`${date}: ${JSON.stringify(errors)}`);
    const groups = data.viewer.zones[0].httpRequestsAdaptiveGroups.length;
    // A full page means Cloudflare cut rows off: fail rather than store a partial day.
    if (groups >= LIMIT)
        throw new Error(`${date}: ${groups} groups hit the limit`);
    return body;
}

async function fromApi(days) {
    const rows = [];
    for (const date of lastDays(days)) {
        const body = await fetchDay(date);
        rows.push({
            dataset: DATASET,
            date,
            fetched_at: toDateTime(new Date()),
            body,
        });
    }
    return rows;
}

async function fromSnapshot(dir) {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    return Promise.all(
        files.map(async (file) => ({
            dataset: DATASET,
            date: file.slice(0, -".json".length),
            fetched_at: toDateTime((await stat(join(dir, file))).mtime),
            body: (await readFile(join(dir, file), "utf8")).trim(),
        })),
    );
}

// One request per day: a day's body is up to about a megabyte.
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
        throw new Error(`${row.date}: ${quarantined_rows} rows quarantined`);
    }
}

async function main() {
    if (!args.snapshot && !process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error("CLOUDFLARE_API_TOKEN env var is required");
    }
    const ingest = !args["dry-run"] && !args.save;
    if (ingest && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    const rows = args.snapshot
        ? await fromSnapshot(args.snapshot)
        : await fromApi(Number(args.days));
    for (const row of rows) {
        const groups = JSON.parse(row.body).data.viewer.zones[0]
            .httpRequestsAdaptiveGroups.length;
        console.log(`${row.date}: ${groups} groups, ${row.body.length} bytes`);
    }

    if (args.save) {
        await mkdir(args.save, { recursive: true });
        for (const row of rows) {
            await writeFile(join(args.save, `${row.date}.json`), row.body);
        }
        console.log(`saved ${rows.length} days to ${args.save}`);
    }
    if (!ingest) return;

    for (const row of rows) await append(row);
    console.log(`${DATASOURCE}: appended ${rows.length} days`);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
