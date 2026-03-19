#!/usr/bin/env npx tsx
/**
 * Daily spore recheck pipeline.
 *
 * Scores 1/7 of all spore users per day via GitHub activity (age, repos, commits, stars).
 * Users above the threshold are promoted to seed; deleted accounts are banned.
 * Runs until all spores have been checked (takes ~7 days for a full cycle).
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/daily-spore-recheck.ts
 *   npx tsx scripts/user-pipeline/daily-spore-recheck.ts --dry-run
 *   npx tsx scripts/user-pipeline/daily-spore-recheck.ts --emails-file /tmp/emails.txt
 *
 * Options:
 *   --dry-run        Preview actions without writing to D1
 *   --verbose / -v   Print per-user score breakdown
 *   --emails-file    Restrict to emails in a newline-separated file
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    extractDeletedGithubIds,
    type GitHubValidationResult,
    isScorableValidationResult,
    storeGithubScores,
    validateUserRecords,
} from "./scoring/github-score.ts";
import { executeD1, queryD1 } from "./shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "./shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_ID_INVALID_REASON,
    PIPELINE_DB_BATCH_SIZE,
} from "./shared/github-identity.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    verbose: boolean;
    cohortEmails: string[] | null;
}

interface SporeRow {
    email: string;
    github_id: number | null;
}

const MAX_USERS_PER_RUN = 8000;

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";
    const emailsFileIndex = args.indexOf("--emails-file");
    const emailsFile =
        emailsFileIndex >= 0 && args[emailsFileIndex + 1]
            ? args[emailsFileIndex + 1]
            : undefined;

    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging and cannot write to production.`,
        );
        process.exit(1);
    }

    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(emailsFile);
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        env: "staging",
        dryRun: args.includes("--dry-run"),
        verbose: args.includes("--verbose") || args.includes("-v"),
        cohortEmails,
    };
}

function fetchSporeCount(
    env: Environment,
    cohortEmails: string[] | null,
): number {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const rows = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function fetchSporeSlice(
    env: Environment,
    cohortEmails: string[] | null,
): { rows: SporeRow[]; totalSpores: number; sliceSize: number } {
    const totalSpores = fetchSporeCount(env, cohortEmails);
    if (totalSpores === 0) {
        return { rows: [], totalSpores: 0, sliceSize: 0 };
    }

    const sliceSize = Math.min(Math.ceil(totalSpores / 7), MAX_USERS_PER_RUN);
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const rows = queryD1(
        env,
        `SELECT email, github_id FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter} ORDER BY score_checked_at ASC, created_at ASC, email ASC LIMIT ${sliceSize}`,
    ) as SporeRow[];

    return { rows, totalSpores, sliceSize };
}

function extractRiskBlockedGithubIds(
    results: GitHubValidationResult[],
): number[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.risk_status === "suspicious" &&
                Number.isInteger(result.github_id) &&
                result.github_id > 0
                    ? [result.github_id]
                    : [],
            ),
        ),
    );
}

function upgradeUsers(env: Environment, githubIds: number[]): number {
    const uniqueIds = Array.from(
        new Set(
            githubIds.filter(
                (githubId): githubId is number =>
                    Number.isInteger(githubId) && githubId > 0,
            ),
        ),
    );
    let upgraded = 0;

    for (
        let index = 0;
        index < uniqueIds.length;
        index += PIPELINE_DB_BATCH_SIZE
    ) {
        const batch = uniqueIds.slice(index, index + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const ok = executeD1(
            env,
            `UPDATE user SET tier = 'seed', tier_balance = ${TIER_POLLEN.seed} WHERE github_id IN (${batch.join(", ")}) AND tier = 'spore'`,
        );
        if (ok) upgraded += batch.length;
    }

    return upgraded;
}

function summarize(results: GitHubValidationResult[]): void {
    const approved = results.filter((result) => result.approved);
    const rejected = results.filter((result) => !result.approved);
    const suspicious = results.filter(
        (result) => result.risk_status === "suspicious",
    );

    console.log("\n📊 Validation summary:");
    console.log(`   Approved by score: ${approved.length}`);
    console.log(`   Rejected by score: ${rejected.length}`);
    console.log(`   Suspicious GitHub profiles: ${suspicious.length}`);

    if (results.length > 0) {
        const average =
            results.reduce(
                (sum, result) => sum + Number(result.details?.total ?? 0),
                0,
            ) / results.length;
        console.log(`   Average score: ${average.toFixed(2)}`);
    }
}

async function main(): Promise<void> {
    const config = parseArguments();
    const { rows, totalSpores, sliceSize } = fetchSporeSlice(
        config.env,
        config.cohortEmails,
    );

    console.log("🌱 Daily Spore Recheck");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
    if (config.cohortEmails) {
        console.log(`   Email cohort: ${config.cohortEmails.length} users`);
    }
    console.log(`   Total spores: ${totalSpores}`);
    console.log(`   Daily target: ${sliceSize}`);
    console.log(`   Selected users: ${rows.length}`);

    if (rows.length === 0) {
        console.log("✅ No spore users to process");
        return;
    }

    const invalidRows = rows.filter(
        (row) => !Number.isInteger(row.github_id) || row.github_id === null,
    );
    const validRows = rows.filter(
        (row): row is SporeRow & { github_id: number } =>
            Number.isInteger(row.github_id) && row.github_id !== null,
    );

    if (invalidRows.length > 0) {
        if (config.dryRun) {
            console.log(
                `🚫 Dry run would ban ${invalidRows.length} spore users with missing/invalid GitHub IDs`,
            );
        } else {
            const banned = banUsersByEmails(
                config.env,
                invalidRows.map((row) => row.email),
                GITHUB_ID_INVALID_REASON,
            );
            console.log(
                `🚫 Banned ${banned} spore users with missing/invalid GitHub IDs`,
            );
        }
    }

    if (validRows.length === 0) {
        console.log("✅ No valid spore users left for GitHub scoring");
        return;
    }

    const results = await validateUserRecords(validRows);
    const resultsByGithubId = new Map(
        results.flatMap((result) =>
            Number.isInteger(result.github_id) && result.github_id > 0
                ? [[result.github_id, result] as const]
                : [],
        ),
    );
    const orderedResults = validRows.flatMap((row) => {
        const result = resultsByGithubId.get(row.github_id);
        return result ? [result] : [];
    });
    const deletedGithubIds = extractDeletedGithubIds(orderedResults);
    const scoreableResults = orderedResults.filter(isScorableValidationResult);
    const unavailableCount =
        orderedResults.length -
        deletedGithubIds.length -
        scoreableResults.length;
    const riskBlockedGithubIds = extractRiskBlockedGithubIds(scoreableResults);
    const riskBlockedSet = new Set(riskBlockedGithubIds);
    const approvedGithubIds = scoreableResults.flatMap((result) =>
        result.approved &&
        Number.isInteger(result.github_id) &&
        result.github_id > 0 &&
        !riskBlockedSet.has(result.github_id)
            ? [result.github_id]
            : [],
    );

    summarize(orderedResults);

    if (config.verbose) {
        console.log("\n📊 Score breakdown samples (first 20):");
        for (const result of orderedResults.slice(0, 20)) {
            const flags = result.risk_flags.join(", ");
            const suffix = flags ? ` | risk: ${flags}` : "";
            console.log(
                `   github_id=${result.github_id}: ${Number(result.details?.total ?? 0).toFixed(1)} (${result.reason})${suffix}`,
            );
        }
    }

    if (config.dryRun) {
        if (deletedGithubIds.length > 0) {
            console.log(
                `\n🚫 Dry run would ban ${deletedGithubIds.length} users with deleted GitHub accounts`,
            );
        }
        if (riskBlockedGithubIds.length > 0) {
            console.log(
                `🚩 Dry run would keep ${riskBlockedGithubIds.length} users at spore due to suspicious GitHub profiles`,
            );
        }
        if (unavailableCount > 0) {
            console.log(
                `⏭️ Dry run would defer ${unavailableCount} users because GitHub scoring was unavailable`,
            );
        }
        console.log(
            `🌱 Dry run would upgrade ${approvedGithubIds.length} users to seed`,
        );
        return;
    }

    if (deletedGithubIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedGithubIds);
        console.log(`\n🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const stored = storeGithubScores(config.env, "spore", scoreableResults);
    const upgraded = upgradeUsers(config.env, approvedGithubIds);

    console.log("\n📊 Results:");
    console.log(`   Scores stored: ${stored}`);
    console.log(`   Risk-blocked from seed: ${riskBlockedGithubIds.length}`);
    console.log(`   Deferred (GitHub unavailable): ${unavailableCount}`);
    console.log(`   Upgraded to seed: ${upgraded}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
