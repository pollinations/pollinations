#!/usr/bin/env npx tsx
/**
 * Manual replay of the daily spore recheck pipeline against a cohort.
 *
 * Resets the cohort to spore (clearing score, score_checked_at, ban state), then
 * loops daily-spore-recheck until all cohort users have been scored. Each pass
 * processes 1/7 of the cohort; the loop runs until unchecked count reaches zero
 * or the pass limit is hit.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npm run user-pipeline:replay-daily -- --emails-file /tmp/emails.txt
 *   npm run user-pipeline:replay-daily -- --emails-file /tmp/emails.txt --dry-run
 *   npm run user-pipeline:replay-daily -- --emails-file /tmp/emails.txt --skip-prepare --passes 3
 *   npm run user-pipeline:replay-daily -- --emails-file /tmp/emails.txt --trace-file /tmp/daily-trace.jsonl
 *
 * Options:
 *   --emails-file    Required. Newline-separated list of emails to replay.
 *   --skip-prepare   Skip the cohort reset (use current D1 state as-is).
 *   --passes N       Max number of daily passes to run (default: cohort size).
 *   --dry-run        Run one dry-run pass without writing to D1.
 *   --trace-file     Append per-pass daily trace output as JSONL
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    executeD1,
    parseEnvironmentArg,
    queryD1,
    type Environment,
} from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

interface ParsedArgs {
    env: Environment;
    emailsFile: string;
    skipPrepare: boolean;
    passes: number | null;
    dryRun: boolean;
    traceFile: string | null;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(workspaceRoot, "..");
const dotenvPath = resolve(repoRoot, ".env");

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const getString = (flag: string, fallback = ""): string => {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
    };
    const getNumber = (flag: string): number | null => {
        const value = getString(flag);
        return value ? Number.parseInt(value, 10) : null;
    };

    const env = parseEnvironmentArg(args);

    const emailsFile = getString("--emails-file");
    if (!emailsFile) {
        console.error("❌ --emails-file is required");
        process.exit(1);
    }

    return {
        env,
        emailsFile,
        skipPrepare: args.includes("--skip-prepare"),
        passes: getNumber("--passes"),
        dryRun: args.includes("--dry-run"),
        traceFile: getString("--trace-file") || null,
    };
}

function countCohortUsers(env: Environment, emails: string[]): number {
    const rows = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function prepareCohort(env: Environment, emails: string[]): void {
    const ok = executeD1(
        env,
        `UPDATE user SET tier = 'spore', tier_balance = ${TIER_POLLEN.spore}, score = NULL, score_checked_at = 0, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    if (!ok) {
        throw new Error("Failed to prepare daily replay cohort in D1");
    }
}

function countUncheckedUsers(env: Environment, emails: string[]): number {
    const rows = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE 1=1${buildEmailFilter("email", emails)} AND COALESCE(banned, 0) = 0 AND (score_checked_at IS NULL OR score_checked_at = 0)`,
    );
    return Number(rows[0]?.count ?? 0);
}

function printSummary(env: Environment, emails: string[]): void {
    const rows = queryD1(
        env,
        `SELECT
            SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore_count,
            SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed_count,
            SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_count,
            SUM(CASE WHEN score_checked_at IS NOT NULL AND score_checked_at > 0 THEN 1 ELSE 0 END) AS checked_count
         FROM user
         WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    const row = rows[0] ?? {};
    console.log("\n📊 Cohort summary:");
    console.log(`   Spore: ${row.spore_count ?? 0}`);
    console.log(`   Seed: ${row.seed_count ?? 0}`);
    console.log(`   Banned: ${row.banned_count ?? 0}`);
    console.log(`   Checked: ${row.checked_count ?? 0}`);
}

function loadDotenvEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (!existsSync(dotenvPath)) {
        return env;
    }

    for (const rawLine of readFileSync(dotenvPath, "utf-8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const [key, ...rest] = line.split("=");
        const rawValue = rest.join("=").trim();
        const value =
            rawValue.startsWith('"') && rawValue.endsWith('"')
                ? rawValue.slice(1, -1)
                : rawValue.startsWith("'") && rawValue.endsWith("'")
                  ? rawValue.slice(1, -1)
                  : rawValue;
        if (!(key in env)) {
            env[key] = value;
        }
    }

    return env;
}

function runCommand(args: string[], env: NodeJS.ProcessEnv): void {
    execFileSync("npm", args, {
        cwd: workspaceRoot,
        env,
        stdio: "inherit",
    });
}

function main(): void {
    const config = parseArguments();
    const emails = loadEmailCohort(config.emailsFile);
    if (!emails) {
        throw new Error("No emails loaded for replay");
    }

    const cohortSize = countCohortUsers(config.env, emails);
    console.log("🧪 Replay Daily Spore Recheck");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Cohort file: ${config.emailsFile}`);
    console.log(`   Cohort size: ${cohortSize}`);
    if (config.traceFile) {
        console.log(`   Trace file: ${config.traceFile}`);
    }

    if (cohortSize === 0) {
        console.error(
            `❌ No users matched the supplied emails in ${config.env}`,
        );
        process.exit(1);
    }

    const childEnv = loadDotenvEnv();
    childEnv.CLOUDFLARE_ENV = config.env;

    if (!config.skipPrepare) {
        console.log("\n🛠️ Preparing cohort for daily replay...");
        prepareCohort(config.env, emails);
        if (config.traceFile) {
            writeFileSync(config.traceFile, "");
        }
    } else {
        console.log("\n⏭️ Skipping cohort preparation");
    }

    if (config.dryRun) {
        console.log("\n🌱 Running one dry-run daily pass...");
        runCommand(
            [
                "run",
                "user-pipeline:daily-spore-recheck",
                "--",
                "--dry-run",
                "--emails-file",
                config.emailsFile,
                ...(config.traceFile
                    ? ["--trace-file", config.traceFile, "--trace-pass", "1"]
                    : []),
            ],
            childEnv,
        );
        return;
    }

    const totalPasses = config.passes ?? cohortSize;
    console.log(`\n🌱 Running up to ${totalPasses} daily pass(es)...`);

    for (let index = 0; index < totalPasses; index += 1) {
        const remainingUnchecked = countUncheckedUsers(config.env, emails);
        if (remainingUnchecked === 0) {
            console.log(`\n✅ Cohort fully checked after ${index} pass(es)`);
            break;
        }

        console.log(`\n   Pass ${index + 1}/${totalPasses}`);
        runCommand(
            [
                "run",
                "user-pipeline:daily-spore-recheck",
                "--",
                "--emails-file",
                config.emailsFile,
                ...(config.traceFile
                    ? [
                          "--trace-file",
                          config.traceFile,
                          "--trace-pass",
                          String(index + 1),
                      ]
                    : []),
            ],
            childEnv,
        );
    }

    printSummary(config.env, emails);
}

main();
