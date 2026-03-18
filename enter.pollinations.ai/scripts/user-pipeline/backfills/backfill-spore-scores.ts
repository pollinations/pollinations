#!/usr/bin/env npx tsx

/**
 * Backfill GitHub scores for existing spore users on staging.
 *
 * Scores users with:
 *   - tier = 'spore'
 *   - github_id IS NOT NULL
 *   - score IS NULL
 *
 * This script stores `score` and `score_checked_at` only. It does not upgrade tiers.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/backfills/backfill-spore-scores.ts --dry-run
 *   npx tsx scripts/user-pipeline/backfills/backfill-spore-scores.ts --env staging --limit 1000 --offset 0
 */

import {
    type ScoredResult,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { executeD1, queryD1 } from "../shared/d1.ts";
import { escapeSqlString } from "../shared/email-cohort.ts";
import {
    banUsersByGithubIds,
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
} from "../shared/github-identity.ts";

type Environment = "staging";

const DEFAULT_LIMIT = 1000;

function parseArguments(): {
    env: Environment;
    dryRun: boolean;
    limit: number;
    offset: number;
} {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";
    const limitIndex = args.indexOf("--limit");
    const limit =
        limitIndex >= 0 && args[limitIndex + 1]
            ? Number.parseInt(args[limitIndex + 1], 10)
            : DEFAULT_LIMIT;
    const offsetIndex = args.indexOf("--offset");
    const offset =
        offsetIndex >= 0 && args[offsetIndex + 1]
            ? Number.parseInt(args[offsetIndex + 1], 10)
            : 0;

    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging.`,
        );
        process.exit(1);
    }

    return {
        env: "staging",
        dryRun: args.includes("--dry-run"),
        limit,
        offset,
    };
}

function fetchBacklogCount(env: Environment): number {
    const results = queryD1(
        env,
        `SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND github_id IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL`,
    );
    return Number(results[0]?.count ?? 0);
}

function fetchBacklogUsers(
    env: Environment,
    limit: number,
    offset: number,
): Array<Record<string, unknown>> {
    return queryD1(
        env,
        `SELECT github_id, github_username FROM user WHERE tier = 'spore' AND github_id IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL ORDER BY created_at ASC, github_id ASC LIMIT ${limit} OFFSET ${offset}`,
    );
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
            const githubId = result.github_id;
            const username = result.username;
            if (!Number.isInteger(githubId) || (githubId as number) <= 0) {
                skipped++;
                continue;
            }
            if (
                typeof username !== "string" ||
                !GITHUB_USERNAME_RE.test(username)
            ) {
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
        if (ok) {
            stored += sanitized.length;
            console.error(
                `   💾 Stored ${stored}/${results.length} score rows`,
            );
        }
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

function summarize(results: ScoredResult[]): void {
    const approved = results.filter((r) => r.approved);
    const rejected = results.filter((r) => !r.approved);

    console.log("\n📊 Validation summary:");
    console.log(`   Approved: ${approved.length}`);
    console.log(`   Rejected: ${rejected.length}`);

    if (results.length > 0) {
        const avgScore =
            results.reduce((sum, r) => sum + Number(r.details?.total ?? 0), 0) /
            results.length;
        console.log(`   Average score: ${avgScore.toFixed(2)}`);
    }
}

async function main(): Promise<number> {
    const config = parseArguments();

    if (config.limit <= 0) {
        console.error("❌ --limit must be greater than 0");
        return 1;
    }
    if (config.offset < 0) {
        console.error("❌ --offset must be 0 or greater");
        return 1;
    }
    if (!config.dryRun && config.offset !== 0) {
        console.error(
            "❌ Live runs must use --offset 0. The backlog shrinks as scores are stored, so non-zero offsets would skip users.",
        );
        return 1;
    }

    const totalBacklog = fetchBacklogCount(config.env);

    console.log("🧮 Backfill Spore Scores");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
    console.log(`   Backlog total: ${totalBacklog}`);
    console.log(`   Slice: offset=${config.offset}, limit=${config.limit}`);

    if (totalBacklog === 0) {
        console.log("✅ No spore backlog to score");
        return 0;
    }

    const userRecords = fetchBacklogUsers(
        config.env,
        config.limit,
        config.offset,
    );
    console.log(`   Selected users: ${userRecords.length}`);

    if (userRecords.length === 0) {
        console.log("✅ No users found in this slice");
        return 0;
    }

    const results = await validateUserRecords(userRecords);
    const resultsByGithubId = new Map(
        results
            .filter((r) => Number.isInteger(r.github_id))
            .map((r) => [r.github_id as number, r]),
    );
    const orderedResults = userRecords
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

    summarize(orderedResults);

    if (deletedGithubIds.length > 0) {
        if (config.dryRun) {
            console.log(
                `\n🚫 Dry run would ban ${deletedGithubIds.length} users with deleted/invalid GitHub accounts`,
            );
        } else {
            const banned = banUsersByGithubIds(config.env, deletedGithubIds);
            console.log(
                `\n🚫 Banned ${banned} users with deleted/invalid GitHub accounts`,
            );
        }
    }

    if (config.dryRun) {
        console.log("\n🔍 Dry run sample:");
        for (const result of orderedResults.slice(0, 20)) {
            const score = Number(result.details?.total ?? 0);
            console.log(
                `   ${result.username}: ${score.toFixed(1)} (${result.reason})`,
            );
        }
        if (orderedResults.length > 20) {
            console.log(`   ... and ${orderedResults.length - 20} more`);
        }
        return 0;
    }

    const { stored, skipped } = storeScores(config.env, scoreableResults);

    console.log("\n✅ Backfill complete:");
    console.log(`   Stored: ${stored}`);
    if (skipped) console.log(`   Skipped invalid usernames: ${skipped}`);
    console.log(
        `   Remaining backlog estimate: ${Math.max(totalBacklog - stored, 0)}`,
    );

    return 0;
}

main().then((code) => process.exit(code));
