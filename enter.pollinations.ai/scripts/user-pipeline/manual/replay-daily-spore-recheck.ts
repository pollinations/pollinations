#!/usr/bin/env npx tsx
/**
 * Prepare a staging cohort and replay the daily spore recheck pipeline on it.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/manual/replay-daily-spore-recheck.ts --emails-file /tmp/cohort.txt
 *   npx tsx scripts/user-pipeline/manual/replay-daily-spore-recheck.ts --emails-file /tmp/cohort.txt --skip-prepare
 *   npx tsx scripts/user-pipeline/manual/replay-daily-spore-recheck.ts --emails-file /tmp/cohort.txt --dry-run
 *   npx tsx scripts/user-pipeline/manual/replay-daily-spore-recheck.ts --emails-file /tmp/cohort.txt --passes 3
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TIER_POLLEN } from "../../../src/tier-config.ts";
import { executeD1, queryD1 } from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

type Environment = "staging";

const WORKDIR = resolve(import.meta.dirname, "../../..");
const REPO_ROOT = resolve(WORKDIR, "..");
const DOTENV_PATH = resolve(REPO_ROOT, ".env");
const SPORE_TIER_BALANCE = TIER_POLLEN.spore;

function parseArguments(): {
    env: Environment;
    emailsFile: string;
    skipPrepare: boolean;
    passes: number | null;
    dryRun: boolean;
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
    const passesIndex = args.indexOf("--passes");
    const passes =
        passesIndex >= 0 && args[passesIndex + 1]
            ? Number.parseInt(args[passesIndex + 1], 10)
            : null;

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
        passes,
        dryRun: args.includes("--dry-run"),
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
        `UPDATE user SET tier = 'spore', tier_balance = ${SPORE_TIER_BALANCE}, score = NULL, score_checked_at = 0, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${emailFilter}`,
    );
}

function countUncheckedUsers(env: Environment, emails: string[]): number {
    const emailFilter = buildEmailFilter("email", emails);
    const results = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE COALESCE(banned, 0) = 0 AND (score_checked_at IS NULL OR score_checked_at = 0)${emailFilter}`,
    );
    return Number(results[0]?.count ?? 0);
}

function printSummary(env: Environment, emails: string[]): void {
    const emailFilter = buildEmailFilter("email", emails);
    const results = queryD1(
        env,
        `SELECT SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore_count, SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed_count, SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_count, SUM(CASE WHEN score_checked_at IS NOT NULL AND score_checked_at > 0 THEN 1 ELSE 0 END) AS checked_count FROM user WHERE 1=1${emailFilter}`,
    );
    if (!results.length) {
        console.log("⚠️ No summary rows returned");
        return;
    }
    const row = results[0];
    console.log("\n📊 Cohort summary:");
    console.log(`   Spore: ${row.spore_count ?? 0}`);
    console.log(`   Seed: ${row.seed_count ?? 0}`);
    console.log(`   Banned: ${row.banned_count ?? 0}`);
    console.log(`   Checked: ${row.checked_count ?? 0}`);
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

console.log("🧪 Replay Daily Spore Recheck");
console.log(`   Environment: ${config.env}`);
console.log(`   Cohort file: ${config.emailsFile}`);
console.log(`   Cohort size: ${cohortSize}`);

if (cohortSize === 0) {
    console.error("❌ No users matched the supplied emails on staging");
    process.exit(1);
}

const childEnv = loadDotenvEnv();

if (!config.skipPrepare) {
    console.log("\n🛠️ Preparing cohort for daily replay...");
    prepareCohort(config.env, emails);
} else {
    console.log("\n⏭️ Skipping cohort preparation");
}

if (config.dryRun) {
    console.log("\n🌱 Running one dry-run daily pass...");
    runCommand(
        [
            "npm",
            "run",
            "user-pipeline:daily-spore-recheck",
            "--",
            "--env",
            config.env,
            "--dry-run",
            "--emails-file",
            config.emailsFile,
        ],
        childEnv,
    );
    process.exit(0);
}

const totalPasses = config.passes ?? cohortSize;
console.log(`\n🌱 Running up to ${totalPasses} daily pass(es)...`);

let completedPasses = 0;
for (let index = 0; index < totalPasses; index++) {
    const remaining = countUncheckedUsers(config.env, emails);
    if (remaining === 0) {
        console.log(`\n✅ Cohort fully checked after ${index} pass(es)`);
        completedPasses = index;
        break;
    }
    console.log(`\n   Pass ${index + 1}/${totalPasses}`);
    runCommand(
        [
            "npm",
            "run",
            "user-pipeline:daily-spore-recheck",
            "--",
            "--env",
            config.env,
            "--emails-file",
            config.emailsFile,
        ],
        childEnv,
    );
    completedPasses = index + 1;
}

if (completedPasses === totalPasses) {
    const remaining = countUncheckedUsers(config.env, emails);
    console.log(
        `\n⚠️ Replay stopped after ${totalPasses} pass(es) with ${remaining} unchecked users remaining`,
    );
}

printSummary(config.env, emails);
