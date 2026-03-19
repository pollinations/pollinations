#!/usr/bin/env npx tsx

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeD1, queryD1 } from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    emailsFile: string;
    skipPrepare: boolean;
    hourlyDryRun: boolean;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../../..");
const repoRoot = resolve(workspaceRoot, "..");
const dotenvPath = resolve(repoRoot, ".env");

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const getString = (flag: string, fallback = ""): string => {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
    };

    const env = getString("--env", "staging");
    if (env !== "staging") {
        console.error(`❌ Unsupported --env ${env}`);
        process.exit(1);
    }

    const emailsFile = getString("--emails-file");
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
    const rows = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function prepareCohort(env: Environment, emails: string[]): void {
    const ok = executeD1(
        env,
        `UPDATE user SET tier = 'microbe', tier_balance = 0, trust_score = NULL, score = NULL, score_checked_at = NULL, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    if (!ok) {
        throw new Error("Failed to prepare hourly replay cohort in D1");
    }
}

function printSummary(env: Environment, emails: string[]): void {
    const rows = queryD1(
        env,
        `SELECT
            SUM(CASE WHEN tier = 'microbe' THEN 1 ELSE 0 END) AS microbe_count,
            SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore_count,
            SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed_count,
            SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_count,
            SUM(CASE WHEN trust_score >= 60 THEN 1 ELSE 0 END) AS trusted_count,
            SUM(CASE WHEN trust_score < 60 AND trust_score IS NOT NULL THEN 1 ELSE 0 END) AS blocked_count
         FROM user
         WHERE 1=1${buildEmailFilter("email", emails)}`,
    );
    const row = rows[0] ?? {};
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
    const command = [
        "run",
        "user-pipeline:hourly-new-users",
        "--",
        "--env",
        config.env,
        "--emails-file",
        config.emailsFile,
    ];
    if (config.hourlyDryRun) {
        command.push("--dry-run");
    }
    runCommand(command, childEnv);

    printSummary(config.env, emails);
}

main();
