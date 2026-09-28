#!/usr/bin/env node

/**
 * Sync Cloudflare traffic for every *.pollinations.ai host → Tinybird
 * cloudflare_traffic_raw.
 *
 * The zone is on the Free plan, where per-request detail is kept for 30 days
 * only, so this runs daily (.github/workflows/data-sync-cloudflare-traffic-tinybird.yml)
 * and stores raw GraphQL responses per UTC day:
 *
 *   page_views  one response per day: HTML pages of pollinations.ai, www and
 *               enter by page, country, device, browser
 *   host_views  one response per host and day: all requests to that host by
 *               country, device, browser and content type, without the path
 *
 * Requests come from real clients only (requestSource eyeball), which leaves
 * out our Workers' own outgoing calls. Paths are kept only for our own page
 * routes: people type prompts into URLs, so any other path may contain prompt
 * text. No IP or user-agent string is requested. Verified bots stay in,
 * labelled by verifiedBotCategory.
 *
 * Usage:
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs [--days 1] [--dry-run]
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs --save <dir> [--days 30]
 *   node operations/cloudflare/sync-traffic-to-tinybird.mjs --snapshot <dir> [--dry-run]
 *
 * --days fetches the last N complete UTC days (up to 30 for backfill); --save
 * writes each response to <dir>/<date>__<dataset>[__<host>].json without
 * ingesting; --snapshot ingests those files later, using each file's mtime as
 * fetched_at.
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
const LIMIT = 10000;
const MAX_RETRIES = 3;
// Cloudflare allows 300 GraphQL queries per 5 minutes.
const QUERY_INTERVAL_MS = 1100;

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

const groupsQuery = (
    dimensions,
) => `query ($zone: String!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: ${LIMIT}, filter: $filter) {
      count
      avg { sampleInterval }
      sum { visits }
      dimensions { ${dimensions} }
    }
  } }
}`;

const PAGE_VIEWS_QUERY = groupsQuery(
    "date clientRequestHTTPHost clientRequestPath clientCountryName clientDeviceType userAgentBrowser verifiedBotCategory",
);
const HOST_VIEWS_QUERY = groupsQuery(
    "date clientRequestHTTPHost clientCountryName clientDeviceType userAgentBrowser edgeResponseContentTypeName verifiedBotCategory",
);
const HOSTS_QUERY = groupsQuery("clientRequestHTTPHost");

const { values: args } = parseArgs({
    options: {
        days: { type: "string", default: "1" },
        save: { type: "string" },
        snapshot: { type: "string" },
        "dry-run": { type: "boolean", default: false },
    },
});

const toDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const groupsOf = (body) =>
    JSON.parse(body).data.viewer.zones[0].httpRequestsAdaptiveGroups;

async function fetchWithRetry(url, options) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const body = await res.text();
        const retryable = res.status >= 500 || res.status === 429;
        if (!retryable || attempt === MAX_RETRIES) {
            throw new Error(`HTTP ${res.status} ${url}: ${body}`);
        }
        await sleep(500 * 2 ** (attempt - 1));
    }
}

// Complete UTC days, newest first: yesterday back to `days` days ago.
function lastDays(days) {
    const today = Date.parse(new Date().toISOString().slice(0, 10));
    return Array.from({ length: days }, (_, i) =>
        new Date(today - (i + 1) * 86_400_000).toISOString().slice(0, 10),
    );
}

async function graphql(query, filter) {
    await sleep(QUERY_INTERVAL_MS);
    const res = await fetchWithRetry(
        "https://api.cloudflare.com/client/v4/graphql",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query,
                variables: { zone: ZONE_ID, filter },
            }),
        },
    );
    const body = await res.text();
    const { errors } = JSON.parse(body);
    if (errors) throw new Error(JSON.stringify(errors));
    // A full page means Cloudflare cut rows off: fail rather than store a partial day.
    if (groupsOf(body).length >= LIMIT) {
        throw new Error(`${JSON.stringify(filter)} hit the ${LIMIT} row limit`);
    }
    return body;
}

async function* fromApi(days) {
    for (const date of lastDays(days)) {
        const real = { date, requestSource: "eyeball" };
        const pageViews = await graphql(PAGE_VIEWS_QUERY, {
            ...real,
            edgeResponseContentTypeName: "html",
            OR: Object.entries(PAGES).map(([host, paths]) => ({
                clientRequestHTTPHost: host,
                clientRequestPath_in: paths,
            })),
        });
        yield { dataset: "page_views", date, host: "", body: pageViews };

        const hosts = groupsOf(
            await graphql(HOSTS_QUERY, {
                ...real,
                clientRequestHTTPHost_like: "%pollinations.ai",
            }),
        ).map((g) => g.dimensions.clientRequestHTTPHost);
        for (const host of hosts) {
            const body = await graphql(HOST_VIEWS_QUERY, {
                ...real,
                clientRequestHTTPHost: host,
            });
            yield { dataset: "host_views", date, host, body };
        }
    }
}

const fileName = ({ date, dataset, host }) =>
    `${[date, dataset, host].filter(Boolean).join("__")}.json`;

async function* fromSnapshot(dir) {
    for (const file of (await readdir(dir)).filter((f) =>
        f.endsWith(".json"),
    )) {
        const [date, dataset, host = ""] = file.slice(0, -5).split("__");
        const path = join(dir, file);
        yield {
            dataset,
            date,
            host,
            fetched_at: toDateTime((await stat(path)).mtime),
            body: (await readFile(path, "utf8")).trim(),
        };
    }
}

// One request per response: a body can be close to a megabyte.
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
            `${fileName(row)}: ${quarantined_rows} rows quarantined`,
        );
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
    if (args.save) await mkdir(args.save, { recursive: true });

    const source = args.snapshot
        ? fromSnapshot(args.snapshot)
        : fromApi(Number(args.days));
    let count = 0;
    for await (const row of source) {
        row.fetched_at ??= toDateTime(new Date());
        console.log(
            `${fileName(row)}: ${groupsOf(row.body).length} groups, ${row.body.length} bytes`,
        );
        if (args.save)
            await writeFile(join(args.save, fileName(row)), row.body);
        if (ingest) await append(row);
        count++;
    }
    console.log(
        `${count} responses ${args.save ? `saved to ${args.save}` : ingest ? `appended to ${DATASOURCE}` : "read"}`,
    );
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
