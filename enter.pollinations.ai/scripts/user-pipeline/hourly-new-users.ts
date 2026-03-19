#!/usr/bin/env npx tsx
/**
 * Hourly new-user pipeline.
 *
 * Promotes trusted microbe users (trust_score >= 60) to seed or spore based on
 * GitHub activity. Validates GitHub account existence first via the shared
 * validateGithubAccounts step, then scores developer activity (age, repos,
 * commits, stars) and applies a risk check. Users above threshold go to seed;
 * others go to spore. Deleted accounts are banned.
 *
 * Runs after trust-score.ts has already written trust_score to D1.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts --dry-run
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts --emails-file /tmp/emails.txt
 *
 * Options:
 *   --dry-run        Preview actions without writing to D1
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
    banUsersByGithubIds,
    PIPELINE_DB_BATCH_SIZE,
    validateGithubAccounts,
} from "./shared/github-identity.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    cohortEmails: string[] | null;
}

interface TrustedUser {
    email: string;
    github_id: number | null;
}

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
        cohortEmails,
    };
}

function fetchTrustedMicrobeUsers(
    env: Environment,
    cohortEmails: string[] | null,
): TrustedUser[] {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    return queryD1(
        env,
        `SELECT email, github_id FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0${emailFilter}`,
    ) as TrustedUser[];
}

function extractRiskBlockedGithubUsers(
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

function applyTierUpdates(
    env: Environment,
    githubIds: number[],
    tier: "spore" | "seed",
    tierBalance: number,
): number {
    const uniqueIds = Array.from(
        new Set(
            githubIds.filter(
                (githubId): githubId is number =>
                    Number.isInteger(githubId) && githubId > 0,
            ),
        ),
    );
    let updated = 0;

    for (let i = 0; i < uniqueIds.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const idList = batch.join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET tier = '${tier}', tier_balance = ${tierBalance} WHERE github_id IN (${idList}) AND tier = 'microbe'`,
        );
        if (ok) updated += batch.length;
    }

    return updated;
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🚀 Hourly New-User Pipeline");
    console.log("=".repeat(50));
    console.log(`📋 Environment: ${config.env}`);
    if (config.dryRun) console.log("🔍 Mode: DRY RUN");
    if (config.cohortEmails) {
        console.log(`🎯 Email cohort: ${config.cohortEmails.length} users`);
    }

    const trustedUsers = fetchTrustedMicrobeUsers(
        config.env,
        config.cohortEmails,
    );
    if (trustedUsers.length === 0) {
        console.log("✅ No trusted microbe users ready for GitHub scoring");
        return;
    }

    console.log(`📊 Trusted microbe users: ${trustedUsers.length}`);

    const scoreableUsers = await validateGithubAccounts(
        trustedUsers,
        config.env,
        !config.dryRun,
    );

    if (scoreableUsers.length === 0) {
        console.log("✅ No valid trusted users left for GitHub scoring");
        return;
    }

    const results = await validateUserRecords(scoreableUsers);
    const deletedGithubIds = extractDeletedGithubIds(results);
    const scoreableResults = results.filter(isScorableValidationResult);
    const unavailableCount =
        results.length - deletedGithubIds.length - scoreableResults.length;
    const riskBlockedGithubIds =
        extractRiskBlockedGithubUsers(scoreableResults);
    const riskBlockedSet = new Set(riskBlockedGithubIds);
    const approvedGithubIds = scoreableResults.flatMap((result) =>
        result.approved &&
        Number.isInteger(result.github_id) &&
        !riskBlockedSet.has(result.github_id)
            ? [result.github_id]
            : [],
    );
    const sporeGithubIds = scoreableResults.flatMap((result) =>
        Number.isInteger(result.github_id) &&
        (!result.approved || riskBlockedSet.has(result.github_id))
            ? [result.github_id]
            : [],
    );

    if (config.dryRun) {
        if (deletedGithubIds.length > 0) {
            console.log(
                `🚫 Would ban ${deletedGithubIds.length} users with deleted GitHub accounts`,
            );
        }
        if (riskBlockedGithubIds.length > 0) {
            console.log(
                `🚩 Would keep ${riskBlockedGithubIds.length} trusted users at spore due to suspicious GitHub profiles`,
            );
        }
        if (unavailableCount > 0) {
            console.log(
                `⏭️ Would defer ${unavailableCount} users because GitHub scoring was unavailable`,
            );
        }
        console.log(`🌱 Would promote to seed: ${approvedGithubIds.length}`);
        console.log(`🍄 Would promote to spore: ${sporeGithubIds.length}`);
        return;
    }

    if (deletedGithubIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedGithubIds);
        console.log(`🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const stored = storeGithubScores(config.env, "microbe", scoreableResults);
    const seeded = applyTierUpdates(
        config.env,
        approvedGithubIds,
        "seed",
        TIER_POLLEN.seed,
    );
    const spored = applyTierUpdates(
        config.env,
        sporeGithubIds,
        "spore",
        TIER_POLLEN.spore,
    );

    console.log("\n📊 Summary:");
    console.log(`   Scores stored: ${stored}`);
    console.log(`   Risk-blocked from seed: ${riskBlockedGithubIds.length}`);
    console.log(`   Deferred (GitHub unavailable): ${unavailableCount}`);
    console.log(`   Microbe -> Seed: ${seeded}`);
    console.log(`   Microbe -> Spore: ${spored}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
