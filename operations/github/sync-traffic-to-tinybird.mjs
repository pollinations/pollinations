#!/usr/bin/env node

/**
 * Sync raw GitHub traffic responses for public pollinations repos → Tinybird
 * github_traffic_raw.
 *
 * GitHub keeps traffic for 14 days only, so this runs daily
 * (.github/workflows/data-sync-github-traffic-tinybird.yml) and stores each
 * response body exactly as returned; pipes such as github_traffic_daily
 * interpret it.
 *
 * Usage:
 *   node operations/github/sync-traffic-to-tinybird.mjs [--dry-run]
 *   node operations/github/sync-traffic-to-tinybird.mjs --snapshot <dir> [--dry-run]
 *
 * --snapshot loads files saved as <repo>.<views|clones|popular_paths|popular_referrers>.json
 * from `gh api repos/pollinations/<repo>/traffic/<endpoint>`, using each file's
 * mtime as fetched_at, to backfill days GitHub no longer serves.
 *
 * Env vars:
 *   GITHUB_TOKEN         Required without --snapshot — needs Administration: read
 *   TINYBIRD_SYNC_TOKEN  Required unless --dry-run
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const ORG = "pollinations";
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

function github(path) {
    return fetchWithRetry(`https://api.github.com/${path}`, {
        headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    }).then((res) => res.text());
}

async function listPublicRepos() {
    const names = [];
    for (let page = 1; ; page++) {
        const repos = JSON.parse(
            await github(
                `orgs/${ORG}/repos?type=public&per_page=100&page=${page}`,
            ),
        );
        names.push(...repos.filter((r) => !r.archived).map((r) => r.name));
        if (repos.length < 100) return names;
    }
}

// Each source yields one repo's four responses as rows, or { repo, error }.
async function* fromApi() {
    for (const repo of await listPublicRepos()) {
        const fetched_at = toDateTime(new Date());
        try {
            const bodies = await Promise.all(
                ENDPOINTS.map((e) =>
                    github(`repos/${ORG}/${repo}/traffic/${e}`),
                ),
            );
            yield {
                repo,
                rows: ENDPOINTS.map((endpoint, i) => ({
                    repo,
                    endpoint,
                    fetched_at,
                    body: bodies[i],
                })),
            };
        } catch (err) {
            yield { repo, error: err.message };
        }
    }
}

async function* fromSnapshot(dir) {
    const repos = (await readdir(dir))
        .filter((f) => f.endsWith(".views.json"))
        .map((f) => f.slice(0, -".views.json".length));
    for (const repo of repos) {
        const file = (endpoint) =>
            join(dir, `${repo}.${endpoint.replace("/", "_")}.json`);
        const { mtime } = await stat(file("views"));
        const fetched_at = toDateTime(mtime);
        const rows = await Promise.all(
            ENDPOINTS.map(async (endpoint) => ({
                repo,
                endpoint,
                fetched_at,
                body: (await readFile(file(endpoint), "utf8")).trim(),
            })),
        );
        yield { repo, rows };
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

    const rows = [];
    const failed = [];
    const source = args.snapshot ? fromSnapshot(args.snapshot) : fromApi();
    for await (const result of source) {
        if (result.error) {
            failed.push(result.repo);
            console.log(`::warning::${result.repo}: ${result.error}`);
            continue;
        }
        rows.push(...result.rows);
    }

    console.log(
        `${rows.length / ENDPOINTS.length} repos read, ${failed.length} unreadable; ${rows.length} rows`,
    );
    if (rows.length === 0)
        throw new Error("No traffic read — refusing to sync");
    if (args["dry-run"]) return;

    await append(rows);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
