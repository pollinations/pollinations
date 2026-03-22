/**
 * Thin wrapper around `wrangler d1 execute` for running SQL against a remote D1 database.
 * queryD1 returns rows; executeD1 runs mutations and returns success/failure.
 */

import { execFileSync } from "node:child_process";
import { escapeSqlString } from "./email-cohort.ts";
import { PIPELINE_DB_BATCH_SIZE } from "./github-identity.ts";

export type Environment = "staging" | "production";
type D1Row = Record<string, string | number | null>;

export interface StoredUserState {
    email: string;
    github_id: number | null;
    tier: string | null;
    banned: number | null;
    ban_reason: string | null;
    score: number | null;
    score_checked_at: number | null;
    trust_score: number | null;
}

interface D1JsonResponse {
    results?: D1Row[];
}

export function parseEnvironmentArg(
    args: string[],
    defaultEnv: Environment = "staging",
): Environment {
    const index = args.indexOf("--env");
    const env = index >= 0 && args[index + 1] ? args[index + 1] : defaultEnv;

    if (env === "staging" || env === "production") {
        return env;
    }

    console.error(
        `❌ Unsupported --env ${env}. Use --env staging or --env production.`,
    );
    process.exit(1);
}

export function getRuntimeEnvironment(): Environment {
    const env = process.env.CLOUDFLARE_ENV ?? process.env.ENVIRONMENT;

    if (env === "staging" || env === "production") {
        return env;
    }

    console.error(
        "❌ Missing runtime environment. Set CLOUDFLARE_ENV=staging|production or use a script that passes --env explicitly.",
    );
    process.exit(1);
}

function buildWranglerArgs(env: Environment, sql: string): string[] {
    return [
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--env",
        env,
        "--command",
        sql,
        "--json",
    ];
}

function normalizeD1Call(
    first: Environment | string,
    second?: string,
): [Environment, string] {
    if (second === undefined) {
        return [getRuntimeEnvironment(), first];
    }

    return [first as Environment, second];
}

export function queryD1(sql: string): D1Row[];
export function queryD1(env: Environment, sql: string): D1Row[];
export function queryD1(first: Environment | string, second?: string): D1Row[] {
    const [env, sql] = normalizeD1Call(first, second);
    const output = execFileSync("npx", buildWranglerArgs(env, sql), {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 100 * 1024 * 1024,
        cwd: process.cwd(),
    });

    const data = JSON.parse(output) as D1JsonResponse[];
    return data[0]?.results || [];
}

export function executeD1(sql: string): boolean;
export function executeD1(env: Environment, sql: string): boolean;
export function executeD1(
    first: Environment | string,
    second?: string,
): boolean {
    const [env, sql] = normalizeD1Call(first, second);
    try {
        execFileSync("npx", buildWranglerArgs(env, sql), {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 20 * 1024 * 1024,
            cwd: process.cwd(),
        });
        return true;
    } catch (error) {
        console.error(
            "❌ D1 mutation failed:",
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}

export function fetchStoredUserStatesByEmail(
    emails: string[],
): Map<string, StoredUserState> {
    const states = new Map<string, StoredUserState>();
    const uniqueEmails = Array.from(new Set(emails));

    for (
        let index = 0;
        index < uniqueEmails.length;
        index += PIPELINE_DB_BATCH_SIZE
    ) {
        const batch = uniqueEmails.slice(index, index + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const rows = queryD1(
            `SELECT email, github_id, tier, COALESCE(banned, 0) AS banned, ban_reason, score, score_checked_at, trust_score FROM user WHERE email IN (${batch
                .map((email) => `'${escapeSqlString(email)}'`)
                .join(", ")})`,
        ) as StoredUserState[];

        for (const row of rows) {
            states.set(row.email, row);
        }
    }

    return states;
}
