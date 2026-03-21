/**
 * GitHub API client for the user pipeline.
 *
 * Provides authenticated REST and GraphQL request helpers with retry logic,
 * rate-limit handling, and automatic token rotation. Supports both GitHub App
 * auth (higher rate limits via installation tokens) and PAT auth (GITHUB_TOKEN
 * or comma-separated GITHUB_TOKENS for rotation).
 */

import * as crypto from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const DEFAULT_USER_AGENT = "pollinations-user-pipeline";

let authMode: "app" | "pat" | null = null;
let appToken: string | null = null;
let appTokenExpiresAt = 0;
let patTokens: string[] | null = null;
let patIndex = 0;

export interface GitHubRateLimit {
    remaining: number | null;
    reset: number | null;
    total: number | null;
}

export interface GitHubRestResult<T> extends GitHubRateLimit {
    data: T | null;
    status: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateLimit(headers: Headers): GitHubRateLimit {
    const parseValue = (key: string): number | null => {
        const value = headers.get(key);
        if (!value) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    return {
        remaining: parseValue("x-ratelimit-remaining"),
        reset: parseValue("x-ratelimit-reset"),
        total: parseValue("x-ratelimit-limit"),
    };
}

function base64url(value: string | Buffer): string {
    return Buffer.from(value).toString("base64url");
}

function resolveGithubAppKeyPath(keyPath: string): string {
    if (existsSync(keyPath)) {
        return keyPath;
    }

    const workspaceRoot = resolve(import.meta.dirname, "../../..");
    const repoRoot = resolve(workspaceRoot, "..");
    for (const directory of [workspaceRoot, repoRoot]) {
        const pemFile = readdirSync(directory).find((entry) =>
            entry.endsWith(".pem"),
        );
        if (pemFile) {
            return resolve(directory, pemFile);
        }
    }

    return keyPath;
}

function generateAppJwt(appId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
        JSON.stringify({
            iat: now - 60,
            exp: now + 10 * 60,
            iss: appId,
        }),
    );
    const signature = crypto
        .sign("sha256", Buffer.from(`${header}.${payload}`), privateKey)
        .toString("base64url");
    return `${header}.${payload}.${signature}`;
}

async function fetchInstallationToken(
    appId: string,
    privateKey: string,
    userAgent: string,
): Promise<{ token: string; expiresAt: number }> {
    const jwt = generateAppJwt(appId, privateKey);

    const installationsResponse = await fetch(
        "https://api.github.com/app/installations",
        {
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "User-Agent": userAgent,
            },
        },
    );
    if (!installationsResponse.ok) {
        throw new Error(
            `GitHub installations request failed: HTTP ${installationsResponse.status}`,
        );
    }

    const installations = (await installationsResponse.json()) as Array<{
        id: number;
    }>;
    if (installations.length === 0) {
        throw new Error("No GitHub App installations found");
    }

    const installationId = installations[0].id;
    const tokenResponse = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": userAgent,
            },
            body: "{}",
        },
    );
    if (!tokenResponse.ok) {
        throw new Error(
            `GitHub installation token request failed: HTTP ${tokenResponse.status}`,
        );
    }

    const data = (await tokenResponse.json()) as {
        token: string;
        expires_at: string;
    };
    const expiresAt = new Date(data.expires_at).getTime() - 5 * 60 * 1000;
    return { token: data.token, expiresAt };
}

function getPatTokens(): string[] {
    if (patTokens) return patTokens;

    const tokenValue = process.env.GITHUB_TOKENS || process.env.GITHUB_TOKEN;
    if (!tokenValue) {
        throw new Error(
            "Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_TOKEN",
        );
    }

    patTokens = tokenValue
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
    return patTokens;
}

export async function getGithubToken(
    userAgent = DEFAULT_USER_AGENT,
): Promise<string> {
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

    if (appId || keyPath) {
        if (!appId || !keyPath) {
            throw new Error(
                "Set both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH for GitHub App auth",
            );
        }
        const resolvedKeyPath = resolveGithubAppKeyPath(keyPath);
        if (!existsSync(resolvedKeyPath)) {
            throw new Error(`GitHub App private key not found: ${keyPath}`);
        }

        if (appToken && Date.now() < appTokenExpiresAt) {
            return appToken;
        }

        const privateKey = readFileSync(resolvedKeyPath, "utf-8");
        const next = await fetchInstallationToken(appId, privateKey, userAgent);
        appToken = next.token;
        appTokenExpiresAt = next.expiresAt;
        authMode = "app";
        return next.token;
    }

    const tokens = getPatTokens();
    authMode = "pat";
    const token = tokens[patIndex % tokens.length];
    patIndex += 1;
    return token;
}

export function getGithubAuthMode(): "app" | "pat" | null {
    return authMode;
}

async function waitForRateLimit(
    rateLimit: GitHubRateLimit,
    fallbackMs: number,
): Promise<void> {
    if (rateLimit.reset) {
        const waitMs = Math.max(rateLimit.reset * 1000 - Date.now(), 0) + 1000;
        await sleep(waitMs);
        return;
    }
    await sleep(fallbackMs);
}

export async function githubRestRequest<T>(
    url: string,
    options?: {
        userAgent?: string;
        retries?: number;
        method?: string;
        body?: string;
    },
): Promise<GitHubRestResult<T>> {
    const retries = options?.retries ?? 3;
    const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;

    for (let attempt = 0; attempt < retries; attempt += 1) {
        const response = await fetch(url, {
            method: options?.method ?? "GET",
            headers: {
                Authorization: `Bearer ${await getGithubToken(userAgent)}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": userAgent,
            },
            body: options?.body,
        });
        const rateLimit = parseRateLimit(response.headers);

        if (response.ok) {
            const data = (await response.json()) as T;
            return {
                data,
                status: response.status,
                ...rateLimit,
            };
        }

        if (response.status === 404) {
            return {
                data: null,
                status: 404,
                ...rateLimit,
            };
        }

        if (
            attempt < retries - 1 &&
            [502, 503, 504].includes(response.status)
        ) {
            await sleep(5000 * (attempt + 1));
            continue;
        }

        if (attempt < retries - 1 && [403, 429].includes(response.status)) {
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter) {
                await sleep((Number.parseInt(retryAfter, 10) + 1) * 1000);
            } else {
                await waitForRateLimit(rateLimit, 60_000);
            }
            continue;
        }

        return {
            data: null,
            status: response.status,
            ...rateLimit,
        };
    }

    throw new Error("GitHub REST request failed without a response");
}

export async function githubGraphqlRequest<T>(
    query: string,
    options?: {
        userAgent?: string;
        retries?: number;
    },
): Promise<{ data: T; rateLimit: GitHubRateLimit }> {
    const retries = options?.retries ?? 3;
    const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;

    for (let attempt = 0; attempt < retries; attempt += 1) {
        const response = await fetch(GITHUB_GRAPHQL_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${await getGithubToken(userAgent)}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": userAgent,
            },
            body: JSON.stringify({ query }),
        });
        const rateLimit = parseRateLimit(response.headers);

        if (response.ok) {
            const data = (await response.json()) as T;
            return { data, rateLimit };
        }

        if (
            attempt < retries - 1 &&
            [502, 503, 504].includes(response.status)
        ) {
            await sleep(5000 * (attempt + 1));
            continue;
        }

        if (attempt < retries - 1 && [403, 429].includes(response.status)) {
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter) {
                await sleep((Number.parseInt(retryAfter, 10) + 1) * 1000);
            } else {
                await waitForRateLimit(rateLimit, 60_000);
            }
            continue;
        }

        const body = await response.text();
        throw new Error(
            `GitHub GraphQL request failed: HTTP ${response.status}: ${body.slice(0, 200)}`,
        );
    }

    throw new Error("GitHub GraphQL request failed without a response");
}
