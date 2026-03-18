#!/usr/bin/env npx tsx
/**
 * Prepare a staging cohort and replay the hourly new-user pipeline on it.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/manual/replay-hourly-new-users.ts --emails-file /tmp/cohort.txt
 *   npx tsx scripts/user-pipeline/manual/replay-hourly-new-users.ts --emails-file /tmp/cohort.txt --skip-prepare
 *   npx tsx scripts/user-pipeline/manual/replay-hourly-new-users.ts --emails-file /tmp/cohort.txt --hourly-dry-run
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeD1, queryD1 } from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

type Environment = "staging";

const WORKDIR = resolve(import.meta.dirname, "../../..");
const REPO_ROOT = resolve(WORKDIR, "..");
const DOTENV_PATH = resolve(REPO_ROOT, ".env");

function parseArguments(): {
    env: Environment;
    emailsFile: string;
    skipPrepare: boolean;
    hourlyDryRun: boolean;
} {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";
    const emailsFileIndex = args.indexOf("--emails-file");
    const emailsFile =
        emailsFileIndex >= 0 && args[emailsFileIndex + 1]
            ? args[emailsFileIndex + 1]
            : "";

    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging.`,
        );
        process.exit(1);
    }
    if (!emailsFile) {
        console.error("❌ --emails-file is required");
        process.exit(1);
    }

    return {
        env: "staging",
        emailsFile,
        skipPrepare: args.includes("--skip-prepare"),
        hourlyDryRun: args.includes("--hourly-dry-run"),
    };
}

function countCohortUsers(env: Environment, emails: string[]): number {
    const emailFilter = buildEmailFilter("email", emails);
    const results = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE 1=1${emailFilter}`,
    );
    return Number(results[0]?.count ?? 0);
}

function prepareCohort(env: Environment, emails: string[]): void {
    const emailFilter = buildEmailFilter("email", emails);
    executeD1(
        env,
        `UPDATE user SET tier = 'microbe', tier_balance = 0, trust_score = NULL, score = NULL, score_checked_at = NULL, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${emailFilter}`,
    );
}

function printSummary(env: Environment, emails: string[]): void {
    const emailFilter = buildEmailFilter("email", emails);
    const results = queryD1(
        env,
        `SELECT SUM(CASE WHEN tier = 'microbe' THEN 1 ELSE 0 END) AS microbe_count, SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore_count, SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed_count, SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_count, SUM(CASE WHEN trust_score >= 60 THEN 1 ELSE 0 END) AS trusted_count, SUM(CASE WHEN trust_score < 60 AND trust_score IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count FROM user WHERE 1=1${emailFilter}`,
    );
    if (!results.length) {
        console.log("⚠️ No summary rows returned");
        return;
    }
    const row = results[0];
    console.log("\n📊 Cohort summary:");
    console.log(`   Microbe: ${row.microbe_count ?? 0}`);
    console.log(`   Spore: ${row.spore_count ?? 0}`);
    console.log(`   Seed: ${row.seed_count ?? 0}`);
    console.log(`   Banned: ${row.banned_count ?? 0}`);
    console.log(`   Trust >= 60: ${row.trusted_count ?? 0}`);
    console.log(`   Trust < 60: ${row.blocked_count ?? 0}`);
}

function loadDotenvEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (!existsSync(DOTENV_PATH)) return env;

    for (const rawLine of readFileSync(DOTENV_PATH, "utf-8").split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const [key, ...rest] = line.split("=");
        let value = rest.join("=").trim();
        if (
            (value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key.trim() in env)) {
            env[key.trim()] = value;
        }
    }

    const keyPath = env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (keyPath && !existsSync(keyPath)) {
        const { readdirSync } = require("node:fs");
        try {
            const pems = readdirSync(REPO_ROOT).filter((f: string) =>
                f.endsWith(".pem"),
            );
            if (pems.length > 0) {
                env.GITHUB_APP_PRIVATE_KEY_PATH = resolve(REPO_ROOT, pems[0]);
            } else {
                delete env.GITHUB_APP_PRIVATE_KEY_PATH;
                delete env.GITHUB_APP_ID;
            }
        } catch {
            delete env.GITHUB_APP_PRIVATE_KEY_PATH;
            delete env.GITHUB_APP_ID;
        }
    }
    return env;
}

function runCommand(command: string[], env: NodeJS.ProcessEnv): void {
    execFileSync(command[0], command.slice(1), {
        cwd: WORKDIR,
        env,
        stdio: "inherit",
    });
}

const config = parseArguments();
const emails = loadEmailCohort(config.emailsFile)!;
const cohortSize = countCohortUsers(config.env, emails);

console.log("🧪 Replay Hourly New-User Pipeline");
console.log(`   Environment: ${config.env}`);
console.log(`   Cohort file: ${config.emailsFile}`);
console.log(`   Cohort size: ${cohortSize}`);

if (cohortSize === 0) {
    console.error("❌ No users matched the supplied emails on staging");
    process.exit(1);
}

const childEnv = loadDotenvEnv();

if (!config.skipPrepare) {
    console.log("\n🛠️ Preparing cohort for hourly replay...");
    prepareCohort(config.env, emails);
} else {
    console.log("\n⏭️ Skipping cohort preparation");
}

console.log("\n🔍 Running trust gate...");
runCommand(
    [
        "npm",
        "run",
        "user-pipeline:trust-score",
        "--",
        "--env",
        config.env,
        "--parallel",
        "3",
        "--store-status",
        "--emails-file",
        config.emailsFile,
    ],
    childEnv,
);

console.log("\n🌱 Running hourly new-user pipeline...");
const hourlyCmd = [
    "npm",
    "run",
    "user-pipeline:hourly-new-users",
    "--",
    "--env",
    config.env,
    "--emails-file",
    config.emailsFile,
];
if (config.hourlyDryRun) hourlyCmd.push("--dry-run");
runCommand(hourlyCmd, childEnv);

printSummary(config.env, emails);
