#!/usr/bin/env npx tsx
/**
 * One-time rollout helper: fill missing GitHub developer scores for existing spore users.
 *
 * Safe by default. Use --apply to write score + score_checked_at.
 *
 * This script never changes tier directly. Deleted/invalid GitHub accounts are
 * only banned when --ban-deleted is passed.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/rollout/fill-spore-github-scores.ts --env staging
 *   npx tsx user-scoring/rollout/fill-spore-github-scores.ts --env production --apply
 *   npx tsx user-scoring/rollout/fill-spore-github-scores.ts --env production --apply --ban-deleted
 */

import {
    bucketValidationResults,
    type GitHubValidationResult,
    storeGithubScores,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { getNumber, hasFlag } from "../shared/cli.ts";
import {
    type Environment,
    parseEnvironmentArg,
    queryD1,
} from "../shared/d1.ts";
import { banUsersByGithubIds } from "../shared/github-identity.ts";

interface ParsedArgs {
    env: Environment;
    apply: boolean;
    banDeleted: boolean;
    limit: number;
    offset: number;
}

interface BacklogRow {
    github_id: number | null;
}

const DEFAULT_LIMIT = 1000;

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);

    const limit = getNumber(args, "--limit", DEFAULT_LIMIT) ?? DEFAULT_LIMIT;
    const offset = getNumber(args, "--offset", 0) ?? 0;
    if (limit <= 0) {
        console.error("❌ --limit must be greater than 0");
        process.exit(1);
    }
    if (offset < 0) {
        console.error("❌ --offset must be 0 or greater");
        process.exit(1);
    }
    const apply = hasFlag(args, "--apply");
    if (apply && offset !== 0) {
        console.error(
            "❌ Live runs must use --offset 0. The backlog shrinks as scores are stored, so non-zero offsets would skip users.",
        );
        process.exit(1);
    }

    return {
        env: parseEnvironmentArg(args),
        apply,
        banDeleted: hasFlag(args, "--ban-deleted"),
        limit,
        offset,
    };
}

function fetchBacklogCount(env: Environment): number {
    const rows = queryD1(
        env,
        "SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND github_id IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL",
    );
    return Number(rows[0]?.count ?? 0);
}

function fetchBacklogUsers(
    env: Environment,
    limit: number,
    offset: number,
): BacklogRow[] {
    return queryD1(
        env,
        `SELECT github_id FROM user WHERE tier = 'spore' AND github_id IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL ORDER BY created_at ASC, github_id ASC LIMIT ${limit} OFFSET ${offset}`,
    ) as BacklogRow[];
}

function summarize(results: GitHubValidationResult[]): void {
    const approved = results.filter((result) => result.approved);
    const rejected = results.filter((result) => !result.approved);
    const unavailable = results.filter(
        (result) => result.status === "unavailable",
    );
    const deleted = results.filter(
        (result) => result.status === "github_account_deleted",
    );

    console.log("\n📊 Validation summary:");
    console.log(`   Approved: ${approved.length}`);
    console.log(`   Rejected: ${rejected.length}`);
    console.log(`   Deleted/invalid accounts: ${deleted.length}`);
    console.log(`   Unavailable GitHub checks: ${unavailable.length}`);

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
    const totalBacklog = fetchBacklogCount(config.env);

    console.log("🧮 Fill Existing Spore Scores");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Mode: ${config.apply ? "APPLY" : "DRY RUN"}`);
    console.log(`   Ban deleted accounts: ${config.banDeleted}`);
    console.log(`   Backlog total: ${totalBacklog}`);
    console.log(`   Slice: offset=${config.offset}, limit=${config.limit}`);

    if (totalBacklog === 0) {
        console.log("✅ No spore backlog to score");
        return;
    }

    const rows = fetchBacklogUsers(config.env, config.limit, config.offset);
    console.log(`   Selected users: ${rows.length}`);
    if (rows.length === 0) {
        console.log("✅ No users found in this slice");
        return;
    }

    const results = await validateUserRecords(rows);
    const { orderedResults, deletedGithubIds, scoreableResults } =
        bucketValidationResults(rows, results);

    summarize(orderedResults);

    if (deletedGithubIds.length > 0) {
        if (!config.apply) {
            console.log(
                `\n🚫 Dry run ${config.banDeleted ? "would" : "would not"} ban ${deletedGithubIds.length} users with deleted/invalid GitHub accounts`,
            );
        } else if (config.banDeleted) {
            const banned = banUsersByGithubIds(config.env, deletedGithubIds);
            console.log(
                `\n🚫 Banned ${banned} users with deleted/invalid GitHub accounts`,
            );
        } else {
            console.log(
                `\n🚫 Skipped banning ${deletedGithubIds.length} users with deleted/invalid GitHub accounts`,
            );
        }
    }

    if (!config.apply) {
        console.log("\n🔍 Dry run sample:");
        for (const result of orderedResults.slice(0, 20)) {
            console.log(
                `   github_id=${result.github_id}: ${Number(result.details?.total ?? 0).toFixed(1)} (${result.reason})`,
            );
        }
        if (orderedResults.length > 20) {
            console.log(`   ... and ${orderedResults.length - 20} more`);
        }
        return;
    }

    const stored = storeGithubScores(config.env, "spore", scoreableResults, {
        onBatchStored: (storedCount, total) => {
            console.log(`   💾 Stored ${storedCount}/${total} score rows`);
        },
    });
    console.log("\n✅ Spore score fill complete:");
    console.log(`   Stored: ${stored}`);
    console.log(
        `   Remaining backlog estimate: ${Math.max(
            totalBacklog -
                stored -
                (config.banDeleted ? deletedGithubIds.length : 0),
            0,
        )}`,
    );

    if (!config.banDeleted && deletedGithubIds.length > 0) {
        console.log(
            "   Note: deleted/invalid GitHub accounts were left untouched and will remain in backlog counts.",
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
