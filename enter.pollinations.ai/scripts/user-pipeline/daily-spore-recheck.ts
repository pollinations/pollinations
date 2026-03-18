#!/usr/bin/env npx tsx
/**
 * Daily spore recheck for seed tier eligibility.
 *
 * This is the steady-state weekly rotation job:
 *   - select unbanned spore users
 *   - order by oldest score_checked_at
 *   - recheck the oldest ceil(total_spores / 7)
 *   - persist score and score_checked_at
 *   - keep suspicious GitHub profiles at spore
 *   - upgrade qualified non-suspicious users to seed immediately
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    type ScoredResult,
    validateUserRecords,
} from "./scoring/github-score.ts";
import { executeD1, queryD1 } from "./shared/d1.ts";
import {
    buildEmailFilter,
    escapeSqlString,
    loadEmailCohort,
} from "./shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
} from "./shared/github-identity.ts";

type Environment = "staging";

const MAX_USERS_PER_RUN = 8000;
const SEED_TIER_BALANCE = TIER_POLLEN.seed;

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    verbose: boolean;
    cohortEmails: string[] | null;
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
        verbose: args.includes("--verbose") || args.includes("-v"),
        cohortEmails,
    };
}

function fetchSporeCount(
    env: Environment,
    cohortEmails: string[] | null,
): number {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const results = queryD1(
        env,
        `SELECT COUNT(*) as count FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter}`,
    );
    return Number(results[0]?.count ?? 0);
}

function fetchSporeSlice(
    env: Environment,
    cohortEmails: string[] | null,
): {
    rows: Array<Record<string, unknown>>;
    totalSpores: number;
    sliceSize: number;
} {
    const totalSpores = fetchSporeCount(env, cohortEmails);
    if (totalSpores === 0) return { rows: [], totalSpores: 0, sliceSize: 0 };

    const sliceSize = Math.min(Math.ceil(totalSpores / 7), MAX_USERS_PER_RUN);
    const emailFilter = buildEmailFilter("email", cohortEmails);

    const rows = queryD1(
        env,
        `SELECT email, github_id, github_username FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter} ORDER BY score_checked_at ASC, created_at ASC, email ASC LIMIT ${sliceSize}`,
    );
    return { rows, totalSpores, sliceSize };
}

function storeScores(
    env: Environment,
    results: ScoredResult[],
): { stored: number; skipped: number } {
    const now = Date.now();
    let stored = 0;
    let skipped = 0;

    for (let i = 0; i < results.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = results.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        const sanitized: Array<{
            githubId: number;
            username: string;
            totalScore: number;
        }> = [];
        for (const result of batch) {
            const username = result.username;
            const githubId = result.github_id;
            if (
                typeof username !== "string" ||
                !GITHUB_USERNAME_RE.test(username)
            ) {
                skipped++;
                continue;
            }
            if (!Number.isInteger(githubId) || (githubId as number) <= 0) {
                skipped++;
                continue;
            }
            const rawScore = result.details?.total ?? 0;
            const totalScore = Number.isFinite(Number(rawScore))
                ? Number(rawScore)
                : 0;
            sanitized.push({
                githubId: githubId as number,
                username,
                totalScore,
            });
        }
        if (sanitized.length === 0) continue;

        const scoreCases = sanitized
            .map(
                ({ githubId, totalScore }) =>
                    `WHEN ${githubId} THEN ${totalScore}`,
            )
            .join(" ");
        const usernameCases = sanitized
            .map(
                ({ githubId, username }) =>
                    `WHEN ${githubId} THEN '${escapeSqlString(username)}'`,
            )
            .join(" ");
        const idList = sanitized.map(({ githubId }) => githubId).join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET score = CASE github_id ${scoreCases} END, github_username = CASE github_id ${usernameCases} END, score_checked_at = ${now} WHERE github_id IN (${idList}) AND tier = 'spore'`,
        );
        if (ok) stored += sanitized.length;
    }

    return { stored, skipped };
}

function extractDeletedGithubIds(results: ScoredResult[]): number[] {
    return results
        .filter(
            (r) =>
                r.status === "github_account_deleted" &&
                Number.isInteger(r.github_id) &&
                (r.github_id as number) > 0,
        )
        .map((r) => r.github_id as number);
}

function extractRiskBlockedGithubIds(results: ScoredResult[]): number[] {
    return Array.from(
        new Set(
            results
                .filter(
                    (r) =>
                        r.risk_status === "suspicious" &&
                        Number.isInteger(r.github_id),
                )
                .map((r) => r.github_id as number),
        ),
    );
}

function upgradeUsers(
    env: Environment,
    githubIds: number[],
): { upgraded: number; failed: boolean } {
    let upgraded = 0;
    let failed = false;

    for (let i = 0; i < githubIds.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = githubIds
            .slice(i, i + PIPELINE_DB_BATCH_SIZE)
            .filter(
                (id): id is number =>
                    Number.isInteger(id) && typeof id !== "boolean" && id > 0,
            );
        if (batch.length === 0) continue;

        const idList = batch.join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET tier = 'seed', tier_balance = ${SEED_TIER_BALANCE} WHERE github_id IN (${idList}) AND tier = 'spore'`,
        );
        if (ok) {
            upgraded += batch.length;
        } else {
            failed = true;
            console.log(
                `   ❌ Batch ${Math.floor(i / PIPELINE_DB_BATCH_SIZE) + 1} failed`,
            );
        }
    }

    return { upgraded, failed };
}

function summarize(results: ScoredResult[]): void {
    const approved = results.filter((r) => r.approved);
    const rejected = results.filter((r) => !r.approved);
    const suspicious = results.filter((r) => r.risk_status === "suspicious");

    console.log("\n📊 Validation summary:");
    console.log(`   Approved by score: ${approved.length}`);
    console.log(`   Rejected by score: ${rejected.length}`);
    console.log(`   Suspicious GitHub profiles: ${suspicious.length}`);

    if (results.length > 0) {
        const avgScore =
            results.reduce((sum, r) => sum + Number(r.details?.total ?? 0), 0) /
            results.length;
        console.log(`   Average score: ${avgScore.toFixed(2)}`);
    }
}

async function main(): Promise<number> {
    try {
        const config = parseArguments();

        console.log("🌱 Daily Spore Recheck");
        console.log(`   Environment: ${config.env}`);
        console.log(`   Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
        if (config.cohortEmails) {
            console.log(`   Email cohort: ${config.cohortEmails.length} users`);
        }

        const { rows, totalSpores, sliceSize } = fetchSporeSlice(
            config.env,
            config.cohortEmails,
        );
        console.log(`   Total spores: ${totalSpores}`);
        console.log(`   Daily target: ${sliceSize}`);
        console.log(`   Selected users: ${rows.length}`);

        if (rows.length === 0) {
            console.log("✅ No spore users to process");
            return 0;
        }

        const invalidEmailRows = rows.filter(
            (row) => !Number.isInteger(row.github_id),
        );
        const validRows = rows.filter((row) => Number.isInteger(row.github_id));

        if (invalidEmailRows.length > 0) {
            if (config.dryRun) {
                console.log(
                    `🚫 Dry run would ban ${invalidEmailRows.length} spore users with missing/invalid GitHub IDs`,
                );
            } else {
                const banned = banUsersByEmails(
                    config.env,
                    invalidEmailRows
                        .filter((row) => typeof row.email === "string")
                        .map((row) => row.email as string),
                );
                console.log(
                    `🚫 Banned ${banned} spore users with missing/invalid GitHub IDs`,
                );
            }
        }

        if (validRows.length === 0) {
            console.log("✅ No valid spore users left for GitHub scoring");
            return 0;
        }

        const results = await validateUserRecords(validRows);
        const resultsByGithubId = new Map(
            results
                .filter((r) => Number.isInteger(r.github_id))
                .map((r) => [r.github_id as number, r]),
        );
        const orderedResults = validRows
            .filter(
                (row) =>
                    Number.isInteger(row.github_id) &&
                    resultsByGithubId.has(row.github_id as number),
            )
            .map((row) => resultsByGithubId.get(row.github_id as number)!);

        const deletedGithubIds = extractDeletedGithubIds(orderedResults);
        const deletedSet = new Set(deletedGithubIds);
        const scoreableResults = orderedResults.filter(
            (r) =>
                Number.isInteger(r.github_id) &&
                !deletedSet.has(r.github_id as number),
        );
        const riskBlockedGithubIds =
            extractRiskBlockedGithubIds(scoreableResults);
        const riskBlockedSet = new Set(riskBlockedGithubIds);
        const approvedGithubIds = scoreableResults
            .filter(
                (r) =>
                    r.approved &&
                    Number.isInteger(r.github_id) &&
                    !riskBlockedSet.has(r.github_id as number),
            )
            .map((r) => r.github_id as number);

        summarize(orderedResults);

        if (config.verbose) {
            console.log("\n📊 Score breakdown samples (first 20):");
            for (const result of orderedResults.slice(0, 20)) {
                const score = Number(result.details?.total ?? 0);
                const flags = (result.risk_flags ?? []).join(", ");
                const suffix = flags ? ` | risk: ${flags}` : "";
                console.log(
                    `   ${result.username}: ${score.toFixed(1)} (${result.reason})${suffix}`,
                );
            }
        }

        if (config.dryRun) {
            if (deletedGithubIds.length > 0) {
                console.log(
                    `\n🚫 Dry run would ban ${deletedGithubIds.length} users with deleted/invalid GitHub accounts`,
                );
            }
            if (riskBlockedGithubIds.length > 0) {
                console.log(
                    `🚩 Dry run would keep ${riskBlockedGithubIds.length} users at spore due to suspicious GitHub profiles`,
                );
            }
            console.log(
                `🌱 Dry run would upgrade ${approvedGithubIds.length} users to seed`,
            );
            return 0;
        }

        if (deletedGithubIds.length > 0) {
            const banned = banUsersByGithubIds(config.env, deletedGithubIds);
            console.log(
                `\n🚫 Banned ${banned} users with deleted/invalid GitHub accounts`,
            );
        }

        const { stored, skipped } = storeScores(config.env, scoreableResults);
        const { upgraded, failed } = upgradeUsers(
            config.env,
            approvedGithubIds,
        );

        console.log("\n📊 Results:");
        console.log(`   Scores stored: ${stored}`);
        console.log(
            `   Risk-blocked from seed: ${riskBlockedGithubIds.length}`,
        );
        console.log(`   Upgraded to seed: ${upgraded}`);
        if (skipped) console.log(`   Skipped invalid usernames: ${skipped}`);
        if (failed) console.log("   ❌ Some upgrade batches failed");

        return failed ? 1 : 0;
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
    }
}

main().then((code) => process.exit(code));
