#!/usr/bin/env npx tsx
/**
 * Hourly new-user pipeline.
 *
 * This script processes trusted microbe users after the trust gate has already
 * run. It scores developer activity for the trusted cohort only, applies a
 * separate GitHub risk check for seed eligibility, then moves each user
 * directly to seed or spore and grants the new tier balance immediately.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts --dry-run
 *   npx tsx scripts/user-pipeline/hourly-new-users.ts --emails-file /tmp/replay-emails.txt
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    type ScoredResult,
    validateUserRecords,
} from "./scoring/github-score.ts";
import { executeD1, queryD1 } from "./shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "./shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    escapeSqlString,
    GITHUB_ACCOUNT_DELETED_REASON,
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
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
    github_username: string | null;
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
        `SELECT email, github_id, github_username FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0${emailFilter}`,
    ) as TrustedUser[];
}

function extractDeletedGithubUsers(results: ScoredResult[]): number[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === GITHUB_ACCOUNT_DELETED_REASON &&
                Number.isInteger(result.github_id)
                    ? [result.github_id as number]
                    : [],
            ),
        ),
    );
}

function extractRiskBlockedGithubUsers(results: ScoredResult[]): number[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.risk_status === "suspicious" &&
                Number.isInteger(result.github_id)
                    ? [result.github_id as number]
                    : [],
            ),
        ),
    );
}

function storeScores(
    env: Environment,
    results: ScoredResult[],
    timestamp: number,
): number {
    let stored = 0;

    for (let i = 0; i < results.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = results
            .slice(i, i + PIPELINE_DB_BATCH_SIZE)
            .flatMap((result) => {
                const githubId = result.github_id;
                const username = result.username;
                if (
                    !Number.isInteger(githubId) ||
                    (githubId as number) <= 0 ||
                    typeof username !== "string" ||
                    !GITHUB_USERNAME_RE.test(username)
                ) {
                    return [];
                }
                const rawScore = Number(result.details?.total ?? 0);
                const totalScore = Number.isFinite(rawScore) ? rawScore : 0;
                return [{ githubId: githubId as number, username, totalScore }];
            });
        if (batch.length === 0) continue;

        const scoreCases = batch
            .map(
                ({ githubId, totalScore }) =>
                    `WHEN ${githubId} THEN ${totalScore}`,
            )
            .join(" ");
        const usernameCases = batch
            .map(
                ({ githubId, username }) =>
                    `WHEN ${githubId} THEN '${escapeSqlString(username)}'`,
            )
            .join(" ");
        const idList = batch.map(({ githubId }) => githubId).join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET score = CASE github_id ${scoreCases} END, github_username = CASE github_id ${usernameCases} END, score_checked_at = ${timestamp} WHERE github_id IN (${idList}) AND tier = 'microbe'`,
        );
        if (ok) stored += batch.length;
    }

    return stored;
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

    const missingOrInvalidGithubUsers = trustedUsers.filter(
        (user) => !Number.isInteger(user.github_id) || user.github_id === null,
    );
    const scoreableUsers = trustedUsers.filter(
        (user): user is TrustedUser & { github_id: number } =>
            Number.isInteger(user.github_id) && user.github_id !== null,
    );

    console.log(`📊 Trusted microbe users: ${trustedUsers.length}`);

    if (config.dryRun) {
        if (missingOrInvalidGithubUsers.length > 0) {
            console.log(
                `🚫 Would ban ${missingOrInvalidGithubUsers.length} users with missing/invalid GitHub IDs`,
            );
        }
    } else if (missingOrInvalidGithubUsers.length > 0) {
        const banned = banUsersByEmails(
            config.env,
            missingOrInvalidGithubUsers.map((user) => user.email),
        );
        console.log(
            `🚫 Banned ${banned} users with missing/invalid GitHub IDs`,
        );
    }

    if (scoreableUsers.length === 0) {
        console.log("✅ No valid trusted users left for GitHub scoring");
        return;
    }

    const results = await validateUserRecords(scoreableUsers);
    const deletedGithubIds = extractDeletedGithubUsers(results);
    const deletedSet = new Set(deletedGithubIds);
    const scoreableResults = results.filter((result) => {
        const githubId = result.github_id;
        return (
            Number.isInteger(githubId) && !deletedSet.has(githubId as number)
        );
    });
    const riskBlockedGithubIds =
        extractRiskBlockedGithubUsers(scoreableResults);
    const riskBlockedSet = new Set(riskBlockedGithubIds);
    const approvedGithubIds = scoreableResults.flatMap((result) =>
        result.approved &&
        Number.isInteger(result.github_id) &&
        !riskBlockedSet.has(result.github_id as number)
            ? [result.github_id as number]
            : [],
    );
    const sporeGithubIds = scoreableResults.flatMap((result) =>
        Number.isInteger(result.github_id) &&
        (!result.approved || riskBlockedSet.has(result.github_id as number))
            ? [result.github_id as number]
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
        console.log(`🌱 Would promote to seed: ${approvedGithubIds.length}`);
        console.log(`🍄 Would promote to spore: ${sporeGithubIds.length}`);
        return;
    }

    if (deletedGithubIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedGithubIds);
        console.log(`🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const now = Date.now();
    const stored = storeScores(config.env, scoreableResults, now);
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
    console.log(`   Microbe -> Seed: ${seeded}`);
    console.log(`   Microbe -> Spore: ${spored}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
