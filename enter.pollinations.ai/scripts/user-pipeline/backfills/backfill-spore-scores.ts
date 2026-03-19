#!/usr/bin/env npx tsx

import {
    extractDeletedGithubIds,
    type GitHubValidationResult,
    isScorableValidationResult,
    storeGithubScores,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { queryD1 } from "../shared/d1.ts";
import { banUsersByGithubIds } from "../shared/github-identity.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    limit: number;
    offset: number;
}

interface BacklogRow {
    github_id: number | null;
}

const DEFAULT_LIMIT = 1000;

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const getString = (flag: string, fallback: string): string => {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
    };
    const getNumber = (flag: string, fallback: number): number => {
        const value = getString(flag, "");
        return value ? Number.parseInt(value, 10) : fallback;
    };

    const env = getString("--env", "staging");
    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging and cannot write to production.`,
        );
        process.exit(1);
    }

    const limit = getNumber("--limit", DEFAULT_LIMIT);
    const offset = getNumber("--offset", 0);
    if (limit <= 0) {
        console.error("❌ --limit must be greater than 0");
        process.exit(1);
    }
    if (offset < 0) {
        console.error("❌ --offset must be 0 or greater");
        process.exit(1);
    }
    if (!args.includes("--dry-run") && offset !== 0) {
        console.error(
            "❌ Live runs must use --offset 0. The backlog shrinks as scores are stored, so non-zero offsets would skip users.",
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

    console.log("\n📊 Validation summary:");
    console.log(`   Approved: ${approved.length}`);
    console.log(`   Rejected: ${rejected.length}`);

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

    console.log("🧮 Backfill Spore Scores");
    console.log(`   Environment: ${config.env}`);
    console.log(`   Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
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
    const resultsByGithubId = new Map(
        results.flatMap((result) =>
            Number.isInteger(result.github_id) && result.github_id > 0
                ? [[result.github_id, result] as const]
                : [],
        ),
    );
    const orderedResults = rows.flatMap((row) => {
        if (!Number.isInteger(row.github_id) || row.github_id <= 0) return [];
        const result = resultsByGithubId.get(row.github_id);
        return result ? [result] : [];
    });
    const deletedGithubIds = extractDeletedGithubIds(orderedResults);
    const scoreableResults = orderedResults.filter(isScorableValidationResult);

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
    console.log("\n✅ Backfill complete:");
    console.log(`   Stored: ${stored}`);
    console.log(
        `   Remaining backlog estimate: ${Math.max(totalBacklog - stored, 0)}`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
