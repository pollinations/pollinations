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
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts --dry-run
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts --emails-file /tmp/replay-emails.txt
 */

import { execSync } from "node:child_process";
import { TIER_POLLEN } from "../../../src/tier-config.ts";
import { executeD1, queryD1 } from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    cohortEmails: string[] | null;
}

interface TrustedUser {
    email: string;
    github_username: string | null;
}

interface ValidationResult {
    username?: string;
    status?: string;
    approved?: boolean;
    risk_status?: "ok" | "suspicious" | "unavailable";
    risk_flags?: string[];
    details?: {
        total?: number;
    } | null;
}

const DB_BATCH_SIZE = 200;
const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

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

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function fetchTrustedMicrobeUsers(
    env: Environment,
    cohortEmails: string[] | null,
): TrustedUser[] {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    return queryD1(
        env,
        `SELECT email, github_username FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0${emailFilter}`,
    ) as TrustedUser[];
}

function runGithubScoring(usernames: string[]): ValidationResult[] {
    if (usernames.length === 0) return [];

    const scriptPath = `${import.meta.dirname}/../github`;
    const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptPath}")
from score_users import validate_users
results = validate_users(${JSON.stringify(usernames)})
print(json.dumps(results))
`;
    const output = execSync(
        `python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`,
        { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
    );

    return JSON.parse(output.trim()) as ValidationResult[];
}

function banUsersByEmails(env: Environment, emails: string[]): number {
    const uniqueEmails = Array.from(new Set(emails));
    let banned = 0;

    for (let i = 0; i < uniqueEmails.length; i += DB_BATCH_SIZE) {
        const batch = uniqueEmails.slice(i, i + DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const emailList = batch
            .map((email) => `'${escapeSqlString(email)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE email IN (${emailList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

function banUsersByGithubUsernames(
    env: Environment,
    usernames: string[],
): number {
    const uniqueUsernames = Array.from(new Set(usernames));
    let banned = 0;

    for (let i = 0; i < uniqueUsernames.length; i += DB_BATCH_SIZE) {
        const batch = uniqueUsernames.slice(i, i + DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const usernameList = batch
            .map((username) => `'${escapeSqlString(username)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE github_username IN (${usernameList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

function extractDeletedGithubUsers(results: ValidationResult[]): string[] {
    const usernames: string[] = [];
    for (const result of results) {
        const username = result.username;
        if (typeof username !== "string") continue;
        if (!GITHUB_USERNAME_RE.test(username)) {
            usernames.push(username);
            continue;
        }
        if (result.status === GITHUB_ACCOUNT_DELETED_REASON) {
            usernames.push(username);
        }
    }
    return Array.from(new Set(usernames));
}

function extractRiskBlockedGithubUsers(results: ValidationResult[]): string[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.risk_status === "suspicious" &&
                typeof result.username === "string"
                    ? [result.username]
                    : [],
            ),
        ),
    );
}

function storeScores(
    env: Environment,
    results: ValidationResult[],
    timestamp: number,
): number {
    let stored = 0;

    for (let i = 0; i < results.length; i += DB_BATCH_SIZE) {
        const batch = results.slice(i, i + DB_BATCH_SIZE).flatMap((result) => {
            const username = result.username;
            if (
                typeof username !== "string" ||
                !GITHUB_USERNAME_RE.test(username)
            ) {
                return [];
            }
            const rawScore = Number(result.details?.total ?? 0);
            const totalScore = Number.isFinite(rawScore) ? rawScore : 0;
            return [{ username, totalScore }];
        });
        if (batch.length === 0) continue;

        const scoreCases = batch
            .map(
                ({ username, totalScore }) =>
                    `WHEN '${escapeSqlString(username)}' THEN ${totalScore}`,
            )
            .join(" ");
        const usernameList = batch
            .map(({ username }) => `'${escapeSqlString(username)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET score = CASE github_username ${scoreCases} END, score_checked_at = ${timestamp} WHERE github_username IN (${usernameList}) AND tier = 'microbe'`,
        );
        if (ok) stored += batch.length;
    }

    return stored;
}

function applyTierUpdates(
    env: Environment,
    usernames: string[],
    tier: "spore" | "seed",
    tierBalance: number,
): number {
    const uniqueUsernames = Array.from(new Set(usernames));
    let updated = 0;

    for (let i = 0; i < uniqueUsernames.length; i += DB_BATCH_SIZE) {
        const batch = uniqueUsernames.slice(i, i + DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const usernameList = batch
            .map((username) => `'${escapeSqlString(username)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET tier = '${tier}', tier_balance = ${tierBalance} WHERE github_username IN (${usernameList}) AND tier = 'microbe'`,
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
        (user) =>
            typeof user.github_username !== "string" ||
            !GITHUB_USERNAME_RE.test(user.github_username),
    );
    const scoreableUsers = trustedUsers.filter(
        (user): user is TrustedUser & { github_username: string } =>
            typeof user.github_username === "string" &&
            GITHUB_USERNAME_RE.test(user.github_username),
    );

    console.log(`📊 Trusted microbe users: ${trustedUsers.length}`);

    if (config.dryRun) {
        if (missingOrInvalidGithubUsers.length > 0) {
            console.log(
                `🚫 Would ban ${missingOrInvalidGithubUsers.length} users with missing/invalid GitHub usernames`,
            );
        }
    } else if (missingOrInvalidGithubUsers.length > 0) {
        const banned = banUsersByEmails(
            config.env,
            missingOrInvalidGithubUsers.map((user) => user.email),
        );
        console.log(
            `🚫 Banned ${banned} users with missing/invalid GitHub usernames`,
        );
    }

    if (scoreableUsers.length === 0) {
        console.log("✅ No valid trusted users left for GitHub scoring");
        return;
    }

    const results = runGithubScoring(
        scoreableUsers.map((user) => user.github_username),
    );
    const deletedUsernames = extractDeletedGithubUsers(results);
    const deletedSet = new Set(deletedUsernames);
    const scoreableResults = results.filter((result) => {
        const username = result.username;
        return typeof username === "string" && !deletedSet.has(username);
    });
    const riskBlockedUsernames =
        extractRiskBlockedGithubUsers(scoreableResults);
    const riskBlockedSet = new Set(riskBlockedUsernames);
    const approvedUsernames = scoreableResults.flatMap((result) =>
        result.approved &&
        typeof result.username === "string" &&
        !riskBlockedSet.has(result.username)
            ? [result.username]
            : [],
    );
    const sporeUsernames = scoreableResults.flatMap((result) =>
        typeof result.username === "string" &&
        (!result.approved || riskBlockedSet.has(result.username))
            ? [result.username]
            : [],
    );

    if (config.dryRun) {
        if (deletedUsernames.length > 0) {
            console.log(
                `🚫 Would ban ${deletedUsernames.length} users with deleted GitHub accounts`,
            );
        }
        if (riskBlockedUsernames.length > 0) {
            console.log(
                `🚩 Would keep ${riskBlockedUsernames.length} trusted users at spore due to suspicious GitHub profiles`,
            );
        }
        console.log(`🌱 Would promote to seed: ${approvedUsernames.length}`);
        console.log(`🍄 Would promote to spore: ${sporeUsernames.length}`);
        return;
    }

    if (deletedUsernames.length > 0) {
        const banned = banUsersByGithubUsernames(config.env, deletedUsernames);
        console.log(`🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const now = Date.now();
    const stored = storeScores(config.env, scoreableResults, now);
    const seeded = applyTierUpdates(
        config.env,
        approvedUsernames,
        "seed",
        TIER_POLLEN.seed,
    );
    const spored = applyTierUpdates(
        config.env,
        sporeUsernames,
        "spore",
        TIER_POLLEN.spore,
    );

    console.log("\n📊 Summary:");
    console.log(`   Scores stored: ${stored}`);
    console.log(`   Risk-blocked from seed: ${riskBlockedUsernames.length}`);
    console.log(`   Microbe -> Seed: ${seeded}`);
    console.log(`   Microbe -> Spore: ${spored}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
