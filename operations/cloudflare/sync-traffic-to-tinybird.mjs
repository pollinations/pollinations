#!/usr/bin/env node

/**
 * Sync Cloudflare traffic for every *.pollinations.ai host → Tinybird
 * cloudflare_traffic_raw.
 *
 * The zone is on the Free plan, where per-request detail is kept for 30 days
 * only, so this runs daily (.github/workflows/data-sync-cloudflare-traffic-tinybird.yml)
 * and stores the GraphQL responses of the queries below unchanged, per UTC
 * day. Fields not requested here cannot be recovered later.
 *
 *   page_views  one response per day: HTML pages of pollinations.ai, www and
 *               enter by page, status, country, device, browser
 *   host_views  one response per host and day: all requests to that host by
 *               status, content type, country, device, browser, without the
 *               path. A host with more groups than one query returns is
 *               fetched as two halves by country code (A–L, M–Z), and the two
 *               group lists are stored together in one response.
 *
 * Requests come from real clients only (requestSource eyeball), which leaves
 * out our Workers' own outgoing calls. Paths are kept only for our own page
 * routes: people type prompts into URLs, so any other path may contain prompt
 * text. No IP or user-agent string is requested. Verified bots stay in,
 * labelled by verifiedBotCategory.
 *
 * Reruns append the same day and host again; the latest fetched_at wins.
 *
 * Usage: node operations/cloudflare/sync-traffic-to-tinybird.mjs [--days 1] [--dry-run]
 *
 * --days fetches the last N complete UTC days (1–7, for a missed run).
 *
 * Env vars:
 *   CLOUDFLARE_API_TOKEN  Required — Analytics read on the pollinations.ai zone
 *   TINYBIRD_SYNC_TOKEN   Required unless --dry-run
 */

import { parseArgs } from "node:util";

const ZONE_ID = "1815735e6400a65d924e0e9f9eb6e18a"; // pollinations.ai
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "cloudflare_traffic_raw";
const LIMIT = 10000;
const MAX_DAYS = 7;
const MAX_RETRIES = 3;
// Cloudflare allows 300 GraphQL queries per 5 minutes; a day takes ~47.
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
    "date clientRequestHTTPHost clientRequestPath edgeResponseStatus clientCountryName clientDeviceType userAgentBrowser verifiedBotCategory",
);
const HOST_VIEWS_QUERY = groupsQuery(
    "date clientRequestHTTPHost edgeResponseStatus edgeResponseContentTypeName clientCountryName clientDeviceType userAgentBrowser verifiedBotCategory",
);
const HOSTS_QUERY = groupsQuery("clientRequestHTTPHost");

const { values: args } = parseArgs({
    options: {
        days: { type: "string", default: "1" },
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
    return body;
}

// A full page means Cloudflare cut rows off: fail rather than store a partial day.
async function complete(query, filter) {
    const body = await graphql(query, filter);
    if (groupsOf(body).length >= LIMIT) {
        throw new Error(`${JSON.stringify(filter)} hit the ${LIMIT} row limit`);
    }
    return body;
}

async function hostViews(filter) {
    const body = await graphql(HOST_VIEWS_QUERY, filter);
    if (groupsOf(body).length < LIMIT) return body;
    // Country halves split a host's groups far more evenly than content type,
    // which is mostly JSON on API hosts.
    const firstHalf = await complete(HOST_VIEWS_QUERY, {
        ...filter,
        clientCountryName_lt: "M",
    });
    const secondHalf = await complete(HOST_VIEWS_QUERY, {
        ...filter,
        clientCountryName_geq: "M",
    });
    return JSON.stringify({
        data: {
            viewer: {
                zones: [
                    {
                        httpRequestsAdaptiveGroups: [
                            ...groupsOf(firstHalf),
                            ...groupsOf(secondHalf),
                        ],
                    },
                ],
            },
        },
    });
}

async function* fromApi(days) {
    for (const date of lastDays(days)) {
        const real = { date, requestSource: "eyeball" };
        const pageViews = await complete(PAGE_VIEWS_QUERY, {
            ...real,
            edgeResponseContentTypeName: "html",
            OR: Object.entries(PAGES).map(([host, paths]) => ({
                clientRequestHTTPHost: host,
                clientRequestPath_in: paths,
            })),
        });
        yield { dataset: "page_views", date, host: "", body: pageViews };

        const hosts = groupsOf(
            await complete(HOSTS_QUERY, {
                ...real,
                clientRequestHTTPHost_like: "%pollinations.ai",
            }),
        ).map((g) => g.dimensions.clientRequestHTTPHost);
        for (const host of hosts) {
            const body = await hostViews({
                ...real,
                clientRequestHTTPHost: host,
            });
            yield { dataset: "host_views", date, host, body };
        }
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
            `${row.date} ${row.dataset} ${row.host}: ${quarantined_rows} rows quarantined`,
        );
    }
}

async function main() {
    if (!process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error("CLOUDFLARE_API_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }
    const days = Number(args.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        throw new Error(
            `--days must be a whole number from 1 to ${MAX_DAYS}, got ${args.days}`,
        );
    }

    const fetched_at = toDateTime(new Date());
    let count = 0;
    for await (const row of fromApi(days)) {
        console.log(
            `${row.date} ${row.dataset} ${row.host}: ${groupsOf(row.body).length} groups, ${row.body.length} bytes`,
        );
        if (!args["dry-run"]) await append({ ...row, fetched_at });
        count++;
    }
    console.log(
        `${count} responses ${args["dry-run"] ? "read" : `appended to ${DATASOURCE}`}`,
    );
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
