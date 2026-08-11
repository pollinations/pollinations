#!/usr/bin/env node

/**
 * Synchronize mutable GitHub usernames from immutable GitHub account IDs.
 *
 * GitHub's GraphQL API accepts the legacy global ID derived from a numeric
 * account ID. Resolving 100 IDs through `nodes` costs one GraphQL point, so a
 * full scan of Enter's users remains well within the GitHub App rate limit.
 *
 * Required environment variables:
 * - GITHUB_TOKEN              GitHub App installation token
 * - Wrangler-authenticated Cloudflare credentials with D1 write access
 *
 * Usage:
 *   node .github/scripts/sync-github-usernames.mjs
 *   node .github/scripts/sync-github-usernames.mjs --dry-run
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const enterWorkdir = fileURLToPath(
    new URL("../../enter.pollinations.ai/", import.meta.url),
);

const D1_PAGE_SIZE = 5_000;
const GITHUB_BATCH_SIZE = 100;
const D1_WRITE_BATCH_SIZE = 500;
const GITHUB_CONCURRENCY = 20;
const MAX_RETRIES = 3;

const githubToken = process.env.GITHUB_TOKEN;
const dryRun = process.argv.includes("--dry-run");

export function legacyGithubNodeId(githubId) {
    if (!Number.isSafeInteger(githubId) || githubId <= 0) {
        throw new Error(`Invalid GitHub account ID: ${githubId}`);
    }
    return Buffer.from(`04:User${githubId}`).toString("base64");
}

export function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export function selectUsernameChanges(users, githubUsers) {
    const usernamesByGithubId = new Map(
        githubUsers
            .filter(
                (user) =>
                    Number.isSafeInteger(user.githubId) &&
                    typeof user.login === "string" &&
                    user.login.length > 0,
            )
            .map((user) => [user.githubId, user.login]),
    );

    return users.flatMap((user) => {
        const githubUsername = usernamesByGithubId.get(user.githubId);
        if (!githubUsername || githubUsername === user.githubUsername) {
            return [];
        }
        return [{ githubId: user.githubId, githubUsername }];
    });
}

function escapeSqlText(value) {
    return value.replaceAll("'", "''");
}

async function executeD1(sql) {
    const { stdout } = await execFileAsync(
        "npx",
        [
            "wrangler",
            "d1",
            "execute",
            "DB",
            "--remote",
            "--env",
            "production",
            "--command",
            sql,
            "--json",
        ],
        {
            cwd: enterWorkdir,
            env: process.env,
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    const result = JSON.parse(stdout);
    const page = Array.isArray(result) ? result[0] : result;
    if (!page?.success || !Array.isArray(page.results)) {
        throw new Error(`D1 query failed: ${stdout}`);
    }
    return page;
}

async function loadUsers() {
    const users = [];
    let cursor = "";

    while (true) {
        const page = await executeD1(
            `SELECT id, github_id, github_username
             FROM user
             WHERE github_id IS NOT NULL AND id > '${escapeSqlText(cursor)}'
             ORDER BY id
             LIMIT ${D1_PAGE_SIZE};`,
        );
        const rows = page.results.map((row) => ({
            id: String(row.id),
            githubId: Number(row.github_id),
            githubUsername: String(row.github_username),
        }));
        users.push(...rows);
        console.log(`Loaded ${users.length} users from D1`);

        if (rows.length < D1_PAGE_SIZE) return users;
        cursor = rows.at(-1).id;
    }
}

function retryDelayMs(response, attempt) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1_000;
    }
    return 250 * 2 ** (attempt - 1);
}

async function loadGithubUserBatch(users) {
    const ids = users.map((user) => legacyGithubNodeId(user.githubId));
    const query = `
        query GithubUsernames($ids: [ID!]!) {
            nodes(ids: $ids) {
                ... on User {
                    databaseId
                    login
                }
            }
            rateLimit {
                cost
                remaining
            }
        }
    `;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${githubToken}`,
                "Content-Type": "application/json",
                "User-Agent": "pollinations-github-username-sync",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({ query, variables: { ids } }),
        });

        if (!response.ok) {
            if (
                (response.status === 429 || response.status >= 500) &&
                attempt < MAX_RETRIES
            ) {
                const delay = retryDelayMs(response, attempt);
                console.log(
                    `GitHub batch retry ${attempt}/${MAX_RETRIES - 1} after ${delay}ms (HTTP ${response.status})`,
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            throw new Error(
                `GitHub GraphQL failed (${response.status}): ${await response.text()}`,
            );
        }

        const body = await response.json();
        if (!body.data?.nodes || !Array.isArray(body.data.nodes)) {
            throw new Error(
                `GitHub GraphQL returned no nodes: ${JSON.stringify(body.errors ?? body)}`,
            );
        }

        return {
            users: body.data.nodes.flatMap((node) =>
                Number.isSafeInteger(node?.databaseId) &&
                typeof node.login === "string"
                    ? [{ githubId: node.databaseId, login: node.login }]
                    : [],
            ),
            unresolved: body.data.nodes.filter((node) => node === null).length,
            rateLimit: body.data.rateLimit,
        };
    }

    throw new Error("GitHub batch exhausted retries");
}

async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < tasks.length) {
            const index = nextIndex++;
            results[index] = await tasks[index]();
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
    );
    return results;
}

async function loadGithubUsers(users) {
    const batches = chunk(users, GITHUB_BATCH_SIZE);
    let completed = 0;
    let unresolved = 0;
    let lastRateLimit = null;
    const results = await runWithConcurrency(
        batches.map((batch) => async () => {
            const result = await loadGithubUserBatch(batch);
            completed++;
            unresolved += result.unresolved;
            lastRateLimit = result.rateLimit;
            if (completed % 25 === 0 || completed === batches.length) {
                console.log(
                    `Resolved ${completed}/${batches.length} GitHub batches; unresolved=${unresolved}; remaining=${lastRateLimit?.remaining ?? "unknown"}`,
                );
            }
            return result.users;
        }),
        GITHUB_CONCURRENCY,
    );
    return { users: results.flat(), unresolved, lastRateLimit };
}

function updateSql(updates) {
    const cases = updates
        .map(
            ({ githubId, githubUsername }) =>
                `WHEN ${githubId} THEN '${escapeSqlText(githubUsername)}'`,
        )
        .join(" ");
    const ids = updates.map(({ githubId }) => githubId).join(", ");
    return `UPDATE user
            SET github_username = CASE github_id ${cases} END
            WHERE github_id IN (${ids});`;
}

async function applyUpdates(updates) {
    for (const [index, batch] of chunk(
        updates,
        D1_WRITE_BATCH_SIZE,
    ).entries()) {
        await executeD1(updateSql(batch));
        console.log(
            `Updated D1 batch ${index + 1}/${Math.ceil(updates.length / D1_WRITE_BATCH_SIZE)} (${batch.length} users)`,
        );
    }
}

async function main() {
    if (!githubToken) {
        throw new Error("GITHUB_TOKEN is required");
    }
    console.log(`GitHub username sync (${dryRun ? "dry run" : "live"})`);
    const users = await loadUsers();
    if (users.length === 0) {
        throw new Error("D1 returned no GitHub users; refusing to continue");
    }

    const github = await loadGithubUsers(users);
    const updates = selectUsernameChanges(users, github.users);
    console.log(
        `Resolved ${github.users.length}/${users.length} GitHub users; ${github.unresolved} unresolved; ${updates.length} usernames changed`,
    );

    if (dryRun || updates.length === 0) return;
    await applyUpdates(updates);
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
