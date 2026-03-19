#!/usr/bin/env npx tsx
/**
 * Replay helper for pipeline testing on staging.
 *
 * Resets a cohort of users (by email file) to a clean state, then runs
 * the hourly or daily pipeline against them.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/manual/replay.ts hourly --emails-file /tmp/emails.txt
 *   npx tsx scripts/user-pipeline/manual/replay.ts daily --emails-file /tmp/emails.txt
 *   npx tsx scripts/user-pipeline/manual/replay.ts daily --emails-file /tmp/emails.txt --skip-prepare --dry-run
 *   npx tsx scripts/user-pipeline/manual/replay.ts daily --emails-file /tmp/emails.txt --passes 5
 */

import { spawnSync } from "node:child_process";
import { queryD1 } from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

const SPORE_TIER_BALANCE = 1.5;

type Pipeline = "hourly" | "daily";

interface ReplayArgs {
    pipeline: Pipeline;
    emailsFile: string;
    skipPrepare: boolean;
    dryRun: boolean;
    passes: number | null;
}

function parseArgs(): ReplayArgs {
    const args = process.argv.slice(2);
    const pipeline = args[0] as Pipeline;

    if (pipeline !== "hourly" && pipeline !== "daily") {
        console.error(
            "Usage: replay.ts <hourly|daily> --emails-file <path> [--skip-prepare] [--dry-run] [--passes N]",
        );
        process.exit(1);
    }

    const emailsFileIndex = args.indexOf("--emails-file");
    const emailsFile =
        emailsFileIndex >= 0 ? args[emailsFileIndex + 1] : undefined;
    if (!emailsFile) {
        console.error("--emails-file is required");
        process.exit(1);
    }

    const passesIndex = args.indexOf("--passes");
    const passes =
        passesIndex >= 0 ? Number.parseInt(args[passesIndex + 1], 10) : null;

    return {
        pipeline,
        emailsFile,
        skipPrepare: args.includes("--skip-prepare"),
        dryRun: args.includes("--dry-run"),
        passes,
    };
}

function countUsers(emailFilter: string): number {
    const rows = queryD1(
        "staging",
        `SELECT COUNT(*) AS count FROM user WHERE 1=1${emailFilter}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function prepareHourlyCohort(emailFilter: string): void {
    queryD1(
        "staging",
        `UPDATE user SET tier = 'microbe', tier_balance = 0, trust_score = NULL, score = NULL, score_checked_at = NULL, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${emailFilter}`,
    );
}

function prepareDailyCohort(emailFilter: string): void {
    queryD1(
        "staging",
        `UPDATE user SET tier = 'spore', tier_balance = ${SPORE_TIER_BALANCE}, score = NULL, score_checked_at = 0, banned = 0, ban_reason = NULL, ban_expires = NULL WHERE 1=1${emailFilter}`,
    );
}

function countUncheckedSpores(emailFilter: string): number {
    const rows = queryD1(
        "staging",
        `SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0 AND (score_checked_at IS NULL OR score_checked_at = 0)${emailFilter}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function runNpm(npmScript: string, extraArgs: string[]): void {
    const result = spawnSync("npm", ["run", npmScript, "--", ...extraArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
    });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function printSummary(emailFilter: string, pipeline: Pipeline): void {
    const tierColumns =
        pipeline === "hourly"
            ? "SUM(CASE WHEN tier = 'microbe' THEN 1 ELSE 0 END) AS microbe, SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore, SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed"
            : "SUM(CASE WHEN tier = 'spore' THEN 1 ELSE 0 END) AS spore, SUM(CASE WHEN tier = 'seed' THEN 1 ELSE 0 END) AS seed";

    const rows = queryD1(
        "staging",
        `SELECT ${tierColumns}, SUM(CASE WHEN COALESCE(banned, 0) = 1 THEN 1 ELSE 0 END) AS banned FROM user WHERE 1=1${emailFilter}`,
    );
    if (!rows[0]) return;

    const row = rows[0];
    console.log("\nCohort summary:");
    for (const [key, value] of Object.entries(row)) {
        console.log(`   ${key}: ${value ?? 0}`);
    }
}

function replayHourly(config: ReplayArgs, emailFilter: string): void {
    if (!config.skipPrepare) {
        console.log("Preparing cohort (reset to microbe)...");
        prepareHourlyCohort(emailFilter);
    }

    console.log("Running trust gate...");
    runNpm("user-pipeline:trust-score", [
        "--env",
        "staging",
        "--parallel",
        "3",
        "--store-status",
        "--emails-file",
        config.emailsFile,
    ]);

    console.log("Running hourly new-user pipeline...");
    const extraArgs = ["--env", "staging", "--emails-file", config.emailsFile];
    if (config.dryRun) extraArgs.push("--dry-run");
    runNpm("user-pipeline:hourly-new-users", extraArgs);
}

function replayDaily(
    config: ReplayArgs,
    emailFilter: string,
    cohortSize: number,
): void {
    if (!config.skipPrepare) {
        console.log("Preparing cohort (reset to spore)...");
        prepareDailyCohort(emailFilter);
    }

    const baseArgs = ["--env", "staging", "--emails-file", config.emailsFile];

    if (config.dryRun) {
        console.log("Running one dry-run daily pass...");
        runNpm("user-pipeline:daily-spore-recheck", [...baseArgs, "--dry-run"]);
        return;
    }

    const totalPasses = config.passes ?? cohortSize;
    console.log(`Running up to ${totalPasses} daily pass(es)...`);

    for (let i = 0; i < totalPasses; i++) {
        const remaining = countUncheckedSpores(emailFilter);
        if (remaining === 0) {
            console.log(`Cohort fully checked after ${i} pass(es)`);
            return;
        }
        console.log(`Pass ${i + 1}/${totalPasses}`);
        runNpm("user-pipeline:daily-spore-recheck", baseArgs);
    }

    const remaining = countUncheckedSpores(emailFilter);
    if (remaining > 0) {
        console.log(
            `Stopped after ${totalPasses} pass(es) with ${remaining} unchecked users remaining`,
        );
    }
}

function main(): void {
    const config = parseArgs();
    const emails = loadEmailCohort(config.emailsFile);
    if (!emails) {
        console.error("No emails loaded");
        process.exit(1);
    }

    const emailFilter = buildEmailFilter("email", emails);
    const cohortSize = countUsers(emailFilter);

    console.log(`Replay ${config.pipeline} pipeline`);
    console.log(`   Environment: staging`);
    console.log(`   Cohort: ${cohortSize} users from ${config.emailsFile}`);

    if (cohortSize === 0) {
        console.error("No users matched the supplied emails on staging");
        process.exit(1);
    }

    if (config.pipeline === "hourly") {
        replayHourly(config, emailFilter);
    } else {
        replayDaily(config, emailFilter, cohortSize);
    }

    printSummary(emailFilter, config.pipeline);
}

main();
