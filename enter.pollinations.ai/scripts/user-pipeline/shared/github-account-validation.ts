/**
 * GitHub account validation — existence checks and identity resolution.
 *
 * Pure TypeScript port of github_account_validation.py.
 * Validates accounts by github_id (REST) or username (GraphQL batch).
 */

import * as crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_REST_USER = "https://api.github.com/user/";
const BATCH_SIZE = 50;
const ACCOUNT_LOOKUP_MAX_WORKERS = 3;
const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

let authMode: "app" | "pat" | null = null;
let appToken: string | null = null;
let appTokenExpiresAt = 0;

function generateAppJwt(appId: string, keyPath: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
        JSON.stringify({ iat: now - 60, exp: now + 10 * 60, iss: appId }),
    ).toString("base64url");
    const privateKey = readFileSync(keyPath, "utf-8");
    const signature = crypto
        .sign("SHA256", Buffer.from(`${header}.${payload}`), privateKey)
        .toString("base64url");
    return `${header}.${payload}.${signature}`;
}

async function fetchAppToken(
    appId: string,
    keyPath: string,
): Promise<{ token: string; expiresAt: number }> {
    const jwt = generateAppJwt(appId, keyPath);

    const installRes = await fetch("https://api.github.com/app/installations", {
        headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-github-validator",
        },
    });
    const installations = (await installRes.json()) as { id: number }[];
    if (!installations.length) {
        throw new Error("No GitHub App installations found");
    }

    const tokenRes = await fetch(
        `https://api.github.com/app/installations/${installations[0].id}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "pollinations-github-validator",
            },
        },
    );
    const tokenData = (await tokenRes.json()) as {
        token: string;
        expires_at: string;
    };
    const expiresAt =
        new Date(tokenData.expires_at).getTime() / 1000 - 5 * 60;
    return { token: tokenData.token, expiresAt };
}

async function getGithubToken(): Promise<string> {
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

    if (appId || keyPath) {
        if (!appId || !keyPath) {
            throw new Error(
                "Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH for GitHub App auth",
            );
        }
        if (!existsSync(keyPath)) {
            throw new Error(`GitHub App private key not found: ${keyPath}`);
        }

        if (appToken && Date.now() / 1000 < appTokenExpiresAt) {
            return appToken;
        }

        const result = await fetchAppToken(appId, keyPath);
        appToken = result.token;
        appTokenExpiresAt = result.expiresAt;
        if (authMode !== "app") {
            console.error(
                `🔑 Using GitHub App auth via ${keyPath.split("/").pop()}`,
            );
            authMode = "app";
        }
        return appToken;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error(
            "Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN",
        );
    }
    if (authMode !== "pat") {
        console.error("🔑 Using GITHUB_TOKEN auth");
        authMode = "pat";
    }
    return token;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GraphQLResponse {
    data?: Record<string, { login: string } | null>;
    errors?: { message: string }[];
}

async function runGraphqlQuery(
    query: string,
    retries = 3,
): Promise<{ data: GraphQLResponse; rateRemaining: number | null }> {
    const token = await getGithubToken();
    let rateRemaining: number | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetch(GITHUB_GRAPHQL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
        });

        rateRemaining = res.headers.has("x-ratelimit-remaining")
            ? Number.parseInt(
                  res.headers.get("x-ratelimit-remaining") as string,
                  10,
              )
            : null;

        if (res.ok) {
            const data = (await res.json()) as GraphQLResponse;
            return { data, rateRemaining };
        }

        if (attempt < retries - 1 && [502, 503, 504].includes(res.status)) {
            await sleep(5000 * (attempt + 1));
            continue;
        }

        if (attempt < retries - 1 && [403, 429].includes(res.status)) {
            const retryAfter = res.headers.get("retry-after");
            const resetAt = res.headers.get("x-ratelimit-reset");
            let wait: number;
            if (retryAfter) {
                wait = (Number.parseInt(retryAfter, 10) + 1) * 1000;
            } else if (resetAt) {
                wait =
                    Math.max(
                        Number.parseInt(resetAt, 10) -
                            Math.floor(Date.now() / 1000),
                        0,
                    ) *
                        1000 +
                    1000;
            } else {
                wait = 60000;
            }
            console.log(
                `   ⏳ Rate limited (HTTP ${res.status}), waiting ${Math.ceil(wait / 1000)}s...`,
            );
            await sleep(wait);
            continue;
        }

        throw new Error(`GitHub GraphQL request failed with HTTP ${res.status}`);
    }

    throw new Error("GitHub GraphQL request failed without a response");
}

async function runRestRequest(
    url: string,
    retries = 3,
): Promise<{
    data: Record<string, unknown> | null;
    rateRemaining: number | null;
    status: number;
}> {
    const token = await getGithubToken();
    let rateRemaining: number | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "pollinations-github-validator",
            },
        });

        rateRemaining = res.headers.has("x-ratelimit-remaining")
            ? Number.parseInt(
                  res.headers.get("x-ratelimit-remaining") as string,
                  10,
              )
            : null;

        if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            return { data, rateRemaining, status: res.status };
        }

        if (res.status === 404) {
            await res.text();
            return { data: null, rateRemaining, status: 404 };
        }

        if (attempt < retries - 1 && [502, 503, 504].includes(res.status)) {
            await sleep(5000 * (attempt + 1));
            continue;
        }

        if (attempt < retries - 1 && [403, 429].includes(res.status)) {
            const retryAfter = res.headers.get("retry-after");
            const resetAt = res.headers.get("x-ratelimit-reset");
            let wait: number;
            if (retryAfter) {
                wait = (Number.parseInt(retryAfter, 10) + 1) * 1000;
            } else if (resetAt) {
                wait =
                    Math.max(
                        Number.parseInt(resetAt, 10) -
                            Math.floor(Date.now() / 1000),
                        0,
                    ) *
                        1000 +
                    1000;
            } else {
                wait = 60000;
            }
            console.log(
                `   ⏳ Rate limited (HTTP ${res.status}), waiting ${Math.ceil(wait / 1000)}s...`,
            );
            await sleep(wait);
            continue;
        }

        await res.text();
        return { data: null, rateRemaining, status: res.status };
    }

    throw new Error("GitHub REST request failed without a response");
}

function buildAccountStatusQuery(usernames: string[]): string {
    const fragments = usernames.map((username, i) => {
        const safe = username.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `
    u${i}: user(login: "${safe}") {
        login
    }`;
    });
    return `query { ${fragments.join("")} }`;
}

async function fetchAccountBatch(
    usernames: string[],
): Promise<{
    results: Array<{ username: string; status: string }>;
    rateRemaining: number | null;
}> {
    const { data, rateRemaining } = await runGraphqlQuery(
        buildAccountStatusQuery(usernames),
    );
    const results = usernames.map((username, i) => {
        const userData = data.data?.[`u${i}`];
        return {
            username,
            status: userData ? "ok" : "github_account_deleted",
        };
    });
    return { results, rateRemaining };
}

async function fetchAccountById(
    githubId: number,
): Promise<{
    data: Record<string, unknown> | null;
    rateRemaining: number | null;
    status: number;
}> {
    return runRestRequest(`${GITHUB_REST_USER}${githubId}`);
}

function parseGithubId(value: unknown): number | null {
    if (typeof value === "boolean") return null;
    if (typeof value === "number") {
        return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value.trim(), 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
}

function normalizeRecord(record: Record<string, unknown>): {
    github_id: number | null;
    github_username: string | null;
} {
    let username = record.github_username;
    if (typeof username !== "string" || !username.trim()) {
        username = record.username;
    }
    if (typeof username !== "string" || !username.trim()) {
        username = null;
    }

    return {
        github_id: parseGithubId(record.github_id),
        github_username:
            typeof username === "string" ? username.trim() : null,
    };
}

async function runConcurrent<T>(
    items: T[],
    maxWorkers: number,
    fn: (item: T) => Promise<void>,
): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: maxWorkers }, async () => {
        while (index < items.length) {
            const current = index++;
            await fn(items[current]);
        }
    });
    await Promise.all(workers);
}

export interface AccountValidationResult {
    github_id: number | null;
    username: string | null;
    status: string;
}

async function validateAccountUsernames(
    usernames: string[],
): Promise<Array<{ username: string; status: string }>> {
    if (usernames.length === 0) return [];

    await getGithubToken();

    const invalidResults = usernames
        .filter((u) => !GITHUB_USERNAME_RE.test(u))
        .map((u) => ({ username: u, status: "github_account_deleted" }));
    const validUsernames = usernames.filter((u) => GITHUB_USERNAME_RE.test(u));

    if (validUsernames.length === 0) return invalidResults;

    const batches: string[][] = [];
    for (let i = 0; i < validUsernames.length; i += BATCH_SIZE) {
        batches.push(validUsernames.slice(i, i + BATCH_SIZE));
    }

    const results = [...invalidResults];
    let completed = 0;

    await runConcurrent(batches, ACCOUNT_LOOKUP_MAX_WORKERS, async (batch) => {
        const { results: batchResults, rateRemaining } =
            await fetchAccountBatch(batch);
        results.push(...batchResults);
        completed++;
        console.log(
            `   Checking accounts: ${completed}/${batches.length} batches (quota: ${rateRemaining ?? "?"})`,
        );

        if (rateRemaining !== null && rateRemaining <= 100) {
            await sleep(rateRemaining > 50 ? 1000 : 2000);
        } else if (rateRemaining === null) {
            await sleep(2000);
        }
    });

    return results;
}

export async function validateAccountRecords(
    records: Array<Record<string, unknown>>,
): Promise<AccountValidationResult[]> {
    if (records.length === 0) return [];

    await getGithubToken();

    const normalized = records.map(normalizeRecord);
    const results: Array<AccountValidationResult | null> = new Array(
        normalized.length,
    ).fill(null);
    const usernameOnly: Array<{ index: number; username: string }> = [];
    const idJobs: Array<{
        index: number;
        githubId: number;
        username: string | null;
    }> = [];

    for (let i = 0; i < normalized.length; i++) {
        const { github_id, github_username } = normalized[i];

        if (github_id !== null) {
            idJobs.push({
                index: i,
                githubId: github_id,
                username: github_username,
            });
            continue;
        }

        if (
            typeof github_username === "string" &&
            GITHUB_USERNAME_RE.test(github_username)
        ) {
            usernameOnly.push({ index: i, username: github_username });
            continue;
        }

        results[i] = {
            github_id,
            username: github_username,
            status: "github_account_deleted",
        };
    }

    if (idJobs.length > 0) {
        let completed = 0;
        await runConcurrent(
            idJobs,
            ACCOUNT_LOOKUP_MAX_WORKERS,
            async (job) => {
                const { data, rateRemaining, status } =
                    await fetchAccountById(job.githubId);
                if (status === 200 && data) {
                    const login = data.login;
                    results[job.index] = {
                        github_id: job.githubId,
                        username:
                            typeof login === "string" ? login : null,
                        status:
                            typeof login === "string"
                                ? "ok"
                                : "github_account_deleted",
                    };
                } else {
                    results[job.index] = {
                        github_id: job.githubId,
                        username: normalized[job.index].github_username,
                        status: "github_account_deleted",
                    };
                }

                completed++;
                if (completed % 50 === 0 || completed === idJobs.length) {
                    console.log(
                        `   Resolving IDs: ${completed}/${idJobs.length} (quota: ${rateRemaining ?? "?"})`,
                    );
                }

                if (rateRemaining !== null && rateRemaining <= 100) {
                    await sleep(rateRemaining > 50 ? 1000 : 2000);
                } else if (rateRemaining === null) {
                    await sleep(1000);
                }
            },
        );
    }

    if (usernameOnly.length > 0) {
        const usernames = usernameOnly.map((u) => u.username);
        const fallbackResults = await validateAccountUsernames(usernames);
        const byUsername = new Map(
            fallbackResults
                .filter((r) => typeof r.username === "string")
                .map((r) => [r.username, r]),
        );
        for (const { index, username } of usernameOnly) {
            const result = byUsername.get(username) ?? {
                username,
                status: "github_account_deleted",
            };
            results[index] = {
                github_id: null,
                username: result.username,
                status: result.status,
            };
        }
    }

    return results.filter(
        (r): r is AccountValidationResult => r !== null,
    );
}
