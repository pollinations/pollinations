#!/usr/bin/env node

/**
 * Sync GitHub traffic for public pollinations repos → Tinybird.
 *
 * GitHub keeps traffic for 14 days only, so this runs daily
 * (.github/workflows/data-sync-github-traffic-tinybird.yml) and appends the
 * whole window. Both datasources are ReplacingMergeTree with fetched_at as the
 * version, so re-sent days collapse to the latest fetch.
 *
 *   github_traffic_daily  views/clones per repo and UTC day
 *   github_traffic_top    top-10 referrers/paths over the 14 days before snapshot_date
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
    }).then((res) => res.json());
}

async function listPublicRepos() {
    const names = [];
    for (let page = 1; ; page++) {
        const repos = await github(
            `orgs/${ORG}/repos?type=public&per_page=100&page=${page}`,
        );
        names.push(...repos.filter((r) => !r.archived).map((r) => r.name));
        if (repos.length < 100) return names;
    }
}

// Each source yields { repo, fetchedAt, traffic: { views, clones, paths, referrers } }.
async function* fromApi() {
    for (const repo of await listPublicRepos()) {
        const fetchedAt = new Date();
        try {
            const [views, clones, paths, referrers] = await Promise.all(
                ENDPOINTS.map((e) =>
                    github(`repos/${ORG}/${repo}/traffic/${e}`),
                ),
            );
            yield {
                repo,
                fetchedAt,
                traffic: { views, clones, paths, referrers },
            };
        } catch (err) {
            yield { repo, error: err.message };
        }
    }
}

async function* fromSnapshot(dir) {
    const files = await readdir(dir);
    const repos = files
        .filter((f) => f.endsWith(".views.json"))
        .map((f) => f.slice(0, -".views.json".length));
    for (const repo of repos) {
        const read = async (endpoint) =>
            JSON.parse(
                await readFile(
                    join(dir, `${repo}.${endpoint.replace("/", "_")}.json`),
                    "utf8",
                ),
            );
        const { mtime } = await stat(join(dir, `${repo}.views.json`));
        const [views, clones, paths, referrers] = await Promise.all(
            ENDPOINTS.map(read),
        );
        yield {
            repo,
            fetchedAt: mtime,
            traffic: { views, clones, paths, referrers },
        };
    }
}

function toRows({ repo, fetchedAt, traffic }) {
    const fetched_at = toDateTime(fetchedAt);
    const snapshot_date = fetched_at.slice(0, 10);
    const daily = [
        ...traffic.views.views.map((d) => ({ metric: "views", ...d })),
        ...traffic.clones.clones.map((d) => ({ metric: "clones", ...d })),
    ].map(({ metric, timestamp, count, uniques }) => ({
        repo,
        metric,
        date: timestamp.slice(0, 10),
        count,
        uniques,
        fetched_at,
    }));
    const top = [
        ...traffic.referrers.map((r) => ({
            kind: "referrer",
            name: r.referrer,
            title: "",
            count: r.count,
            uniques: r.uniques,
        })),
        ...traffic.paths.map((p) => ({
            kind: "path",
            name: p.path,
            title: p.title,
            count: p.count,
            uniques: p.uniques,
        })),
    ].map((row) => ({ repo, snapshot_date, ...row, fetched_at }));
    return { daily, top };
}

async function append(datasource, rows) {
    if (rows.length === 0) return;
    const res = await fetchWithRetry(
        `${TINYBIRD_BASE}/v0/events?name=${datasource}&wait=true`,
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
            `${datasource}: ${successful_rows}/${rows.length} rows ingested, ${quarantined_rows} quarantined`,
        );
    }
    console.log(`${datasource}: appended ${successful_rows} rows`);
}

async function main() {
    if (!args.snapshot && !process.env.GITHUB_TOKEN) {
        throw new Error("GITHUB_TOKEN env var is required");
    }
    if (!args["dry-run"] && !process.env.TINYBIRD_SYNC_TOKEN) {
        throw new Error("TINYBIRD_SYNC_TOKEN env var is required");
    }

    const daily = [];
    const top = [];
    const failed = [];
    let reposRead = 0;
    const source = args.snapshot ? fromSnapshot(args.snapshot) : fromApi();
    for await (const result of source) {
        if (result.error) {
            failed.push(result.repo);
            console.log(`::warning::${result.repo}: ${result.error}`);
            continue;
        }
        reposRead++;
        const rows = toRows(result);
        daily.push(...rows.daily);
        top.push(...rows.top);
    }

    console.log(
        `${reposRead} repos read, ${failed.length} unreadable; ${daily.length} daily rows, ${top.length} top rows`,
    );
    if (daily.length === 0)
        throw new Error("No traffic read — refusing to sync");
    if (args["dry-run"]) return;

    await append("github_traffic_daily", daily);
    await append("github_traffic_top", top);
}

main().catch((err) => {
    console.error("Sync failed:", err.message);
    process.exit(1);
});
