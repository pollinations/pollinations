#!/usr/bin/env node

/**
 * Sync raw GitHub traffic responses for pollinations/pollinations → Tinybird
 * github_traffic_raw.
 *
 * GitHub keeps traffic for 14 days only, so this runs daily
 * (.github/workflows/data-sync-github-traffic-tinybird.yml) and stores each
 * response body exactly as returned for later analysis.
 *
 * Usage:
 *   node operations/github/sync-traffic-to-tinybird.mjs [--dry-run]
 *   node operations/github/sync-traffic-to-tinybird.mjs --snapshot <dir> [--dry-run]
 *
 * --snapshot loads files saved as pollinations.<views|clones|popular_paths|popular_referrers>.json
 * from `gh api repos/pollinations/pollinations/traffic/<endpoint>`, using the
 * views file's mtime as fetched_at, to backfill days GitHub no longer serves.
 *
 * Env vars:
 *   GITHUB_TOKEN         Required without --snapshot — needs Administration: read
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const REPO = "pollinations/pollinations";
const TINYBIRD_BASE = "https://api.europe-west2.gcp.tinybird.co";
const DATASOURCE = "github_traffic_raw";
const ENDPOINTS = ["views", "clones", "popular/paths", "popular/referrers"];
const MAX_RETRIES = 3;

const { values: args } = parseArgs({
    options: {
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

async function fromApi() {
    const fetched_at = toDateTime(new Date());
    return Promise.all(
        ENDPOINTS.map(async (endpoint) => {
            const res = await fetchWithRetry(
                `https://api.github.com/repos/${REPO}/traffic/${endpoint}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                        Accept: "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                },
            );
            return { endpoint, fetched_at, body: await res.text() };
        }),
    );
}

async function fromSnapshot(dir) {
    const file = (endpoint) =>
        join(dir, `pollinations.${endpoint.replace("/", "_")}.json`);
    const fetched_at = toDateTime((await stat(file("views"))).mtime);
    return Promise.all(
        ENDPOINTS.map(async (endpoint) => ({
            endpoint,
            fetched_at,
            body: (await readFile(file(endpoint), "utf8")).trim(),
        })),
    );
}

async function append(rows) {
    const res = await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/events?name=${DATASOURCE}&wait=true`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.TINYBIRD_SYNC_TOKEN}`,
            },
            body: rows.map((r) => JSON.stringify(r)).join("\n"),
        },
    );
    const { successful_rows, quarantined_rows } = await res.json();
    if (quarantined_rows > 0 || successful_rows !== rows.length) {
        throw new Error(
            `${successful_rows}/${rows.length} rows ingested, ${quarantined_rows} quarantined`,
        );
    }
    console.log(`${DATASOURCE}: appended ${successful_rows} rows`);
}

async function main() {
    if (!args.snapshot && !process.env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    const rows = args.snapshot
        ? await fromSnapshot(args.snapshot)
        : await fromApi();
    console.log(`${REPO}: ${rows.length} responses read`);
    if (args["dry-run"]) return;

    await append(rows);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
