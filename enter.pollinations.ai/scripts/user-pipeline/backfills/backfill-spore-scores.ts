#!/usr/bin/env npx tsx
/**
 * One-time backfill: score existing spore users who have no score yet.
 *
 * Stores score + score_checked_at only. Does not upgrade tiers.
 *
 * Usage:
 *   npx tsx scripts/user-pipeline/backfills/backfill-spore-scores.ts --dry-run
 *   npx tsx scripts/user-pipeline/backfills/backfill-spore-scores.ts --limit 500
 */

import { queryD1 } from "../shared/d1.ts";
import { banUsersByGithubIds } from "../shared/github-identity.ts";
import {
    classifyResults,
    runGithubScoring,
    storeScores,
} from "../shared/scoring-pipeline.ts";

function parseArgs(): { dryRun: boolean; limit: number } {
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf("--limit");
    const limit =
        limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1], 10) : 1000;

    return { dryRun: args.includes("--dry-run"), limit };
}

function fetchBacklogUsers(limit: number): Record<string, unknown>[] {
    return queryD1(
        "staging",
        `SELECT github_id, github_username FROM user WHERE tier = 'spore' AND github_id IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL ORDER BY created_at ASC, github_id ASC LIMIT ${limit}`,
    );
}

function main(): void {
    const config = parseArgs();

    const users = fetchBacklogUsers(config.limit);
    console.log(
        `Backfill spore scores (${config.dryRun ? "DRY RUN" : "LIVE"})`,
    );
    console.log(`   Users to score: ${users.length}`);

    if (users.length === 0) {
        console.log("No spore backlog to score");
        return;
    }

    const results = runGithubScoring(users);
    const { deletedIds, scoreableResults } = classifyResults(results);

    const approved = results.filter((r) => r.approved).length;
    const avgScore =
        results.length > 0
            ? results.reduce(
                  (sum, r) => sum + Number(r.details?.total ?? 0),
                  0,
              ) / results.length
            : 0;

    console.log(
        `   Approved: ${approved}, Rejected: ${results.length - approved}`,
    );
    console.log(`   Average score: ${avgScore.toFixed(2)}`);
    console.log(`   Deleted GitHub accounts: ${deletedIds.length}`);

    if (config.dryRun) {
        for (const r of results.slice(0, 20)) {
            const score = Number(r.details?.total ?? 0);
            console.log(`   ${r.username}: ${score.toFixed(1)}`);
        }
        if (results.length > 20) {
            console.log(`   ... and ${results.length - 20} more`);
        }
        return;
    }

    if (deletedIds.length > 0) {
        const banned = banUsersByGithubIds("staging", deletedIds);
        console.log(`   Banned ${banned} deleted GitHub accounts`);
    }

    const stored = storeScores(
        "staging",
        scoreableResults,
        Date.now(),
        "spore",
    );
    console.log(`   Stored: ${stored}`);
}

main();
