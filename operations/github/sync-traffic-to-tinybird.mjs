#!/usr/bin/env node

/**
 * Sync raw GitHub traffic responses for pollinations/pollinations → Tinybird
 * github_traffic_raw.
 *
 * GitHub keeps traffic for 14 days only, so this runs daily
 * (.github/workflows/data-sync-github-traffic-tinybird.yml) and stores each
 * response body exactly as returned for later analysis. Every run sends the
 * whole 14-day window, so a failed run is covered by the next one.
 *
 * Usage: node operations/github/sync-traffic-to-tinybird.mjs [--dry-run]
 *
 * Env vars:
 *   GITHUB_TOKEN         Required — needs Administration: read
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { parseArgs } from "node:util";

const REPO = "pollinations/pollinations";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "github_traffic_raw";
const ENDPOINTS = ["views", "clones", "popular/paths", "popular/referrers"];

const { values: args } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
});

const toDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");

// Views and clones answer with {count, uniques, <endpoint>: [...]}, the
// popular endpoints with an array. Anything else is an error, even with 200.
function assertTraffic(endpoint, body) {
    const data = JSON.parse(body);
    const ok = endpoint.startsWith("popular/")
        ? Array.isArray(data)
        : Array.isArray(data?.[endpoint]) && Number.isInteger(data.count);
    if (!ok)
        throw new Error(
            `${endpoint}: unexpected response ${body.slice(0, 200)}`,
        );
}

async function fetchTraffic(fetched_at) {
    return Promise.all(
        ENDPOINTS.map(async (endpoint) => {
            const res = await fetch(
                `https://api.github.com/repos/${REPO}/traffic/${endpoint}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                        Accept: "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                },
            );
            const body = await res.text();
            if (!res.ok)
                throw new Error(`${endpoint}: HTTP ${res.status} ${body}`);
            assertTraffic(endpoint, body);
            return { endpoint, fetched_at, body };
        }),
    );
}

async function append(rows) {
    const res = await fetch(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.TINYBIRD_SYNC_TOKEN}`,
            },
            body: rows.map((r) => JSON.stringify(r)).join("\n"),
        },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`Tinybird HTTP ${res.status} ${text}`);
    const { successful_rows, quarantined_rows } = JSON.parse(text);
    if (quarantined_rows > 0 || successful_rows !== rows.length) {
        throw new Error(
            `${successful_rows}/${rows.length} rows ingested, ${quarantined_rows} quarantined`,
        );
    }
    console.log(`${DATASOURCE}: appended ${successful_rows} rows`);
}

async function main() {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    const rows = await fetchTraffic(toDateTime(new Date()));
    console.log(`${REPO}: ${rows.length} responses read`);
    if (args["dry-run"]) return;

    await append(rows);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
