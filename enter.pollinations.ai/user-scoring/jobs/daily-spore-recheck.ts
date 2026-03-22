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
 *   npx tsx user-scoring/jobs/daily-spore-recheck.ts
 *   npx tsx user-scoring/jobs/daily-spore-recheck.ts --dry-run
 *   npx tsx user-scoring/jobs/daily-spore-recheck.ts --emails-file /tmp/emails.txt
 *   npx tsx user-scoring/jobs/daily-spore-recheck.ts --emails-file /tmp/emails.txt --trace-file /tmp/daily-trace.jsonl
 *
 * Options:
 *   --dry-run        Preview actions without writing to D1
 *   --verbose / -v   Print per-user score breakdown
 *   --emails-file    Restrict to emails in a newline-separated file
 *   --trace-file     Append per-user decision traces as JSONL
 *   --trace-pass     Optional pass number for replay harness trace correlation
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    bucketValidationResults,
    extractApprovedGithubIds,
    extractRiskBlockedGithubIds,
    type GitHubValidationResult,
    storeGithubCheckTimestamps,
    storeGithubScores,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { getNumber, getString, hasFlag } from "../shared/cli.ts";
import {
    executeD1,
    fetchStoredUserStatesByEmail,
    getRuntimeEnvironment,
    queryD1,
    type StoredUserState,
} from "../shared/d1.ts";
import { buildEmailFilter, loadEmailCohort } from "../shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_ID_INVALID_REASON,
} from "../shared/github-identity.ts";
import { appendTrace } from "../shared/trace.ts";

interface ParsedArgs {
    dryRun: boolean;
    verbose: boolean;
    cohortEmails: string[] | null;
    traceFile: string | null;
    tracePass: number | null;
}

interface SporeRow {
    email: string;
    github_id: number | null;
}

type DailyDecision =
    | "ban_invalid_id"
    | "ban_deleted"
    | "defer_unavailable"
    | "keep_spore_below_threshold"
    | "keep_spore_risk_blocked"
    | "promote_seed"
    | "missing_result";

const MAX_USERS_PER_RUN = 8000;

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const traceFile = getString(args, "--trace-file") ?? null;
    const tracePass = getNumber(args, "--trace-pass") ?? null;

    let cohortEmails: string[] | null = null;
    try {
        cohortEmails = loadEmailCohort(getString(args, "--emails-file"));
    } catch (error) {
        console.error(
            `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }

    return {
        dryRun: hasFlag(args, "--dry-run"),
        verbose: hasFlag(args, "--verbose") || hasFlag(args, "-v"),
        cohortEmails,
        traceFile,
        tracePass,
    };
}

function fetchSporeCount(cohortEmails: string[] | null): number {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const rows = queryD1(
        `SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter}`,
    );
    return Number(rows[0]?.count ?? 0);
}

function fetchSporeSlice(cohortEmails: string[] | null): {
    rows: SporeRow[];
    totalSpores: number;
    sliceSize: number;
} {
    const totalSpores = fetchSporeCount(cohortEmails);
    if (totalSpores === 0) {
        return { rows: [], totalSpores: 0, sliceSize: 0 };
    }

    const sliceSize = Math.min(Math.ceil(totalSpores / 7), MAX_USERS_PER_RUN);
    const emailFilter = buildEmailFilter("email", cohortEmails);
    const rows = queryD1(
        `SELECT email, github_id FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter} ORDER BY score_checked_at ASC, created_at ASC, email ASC LIMIT ${sliceSize}`,
    ) as SporeRow[];

    return { rows, totalSpores, sliceSize };
}

function upgradeUsers(githubIds: number[]): number {
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

function classifyDecision(
    result: GitHubValidationResult | null | undefined,
): DailyDecision {
    if (!result) return "missing_result";
    if (result.status === "github_account_deleted") return "ban_deleted";
    if (result.status === "unavailable") return "defer_unavailable";
    if (result.approved && result.risk_status === "suspicious") {
        return "keep_spore_risk_blocked";
    }
    if (result.approved) return "promote_seed";
    return "keep_spore_below_threshold";
}

function reconcileDecision(
    decision: DailyDecision,
    state: StoredUserState | undefined,
): string | null {
    if (!state) return "missing_post_state";

    switch (decision) {
        case "ban_invalid_id":
        case "ban_deleted":
            return Number(state.banned ?? 0) === 1
                ? null
                : "expected_banned_user";
        case "defer_unavailable":
            if (Number(state.banned ?? 0) !== 0 || state.tier !== "spore") {
                return "unexpected_state_for_unavailable";
            }
            if (
                !Number.isFinite(
                    Number(state.score_checked_at ?? Number.NaN),
                ) ||
                Number(state.score_checked_at ?? 0) <= 0
            ) {
                return "missing_score_checked_at";
            }
            return null;
        case "keep_spore_below_threshold":
        case "keep_spore_risk_blocked":
            if (state.tier !== "spore") return "expected_spore_tier";
            if (
                !Number.isFinite(
                    Number(state.score_checked_at ?? Number.NaN),
                ) ||
                Number(state.score_checked_at ?? 0) <= 0
            ) {
                return "missing_score_checked_at";
            }
            return null;
        case "promote_seed":
            return state.tier === "seed" ? null : "expected_seed_tier";
        case "missing_result":
            return "missing_validation_result";
    }
}

async function main(): Promise<void> {
    const config = parseArguments();
    const runId = `${Date.now()}-${process.pid}`;
    const env = getRuntimeEnvironment();
    const { rows, totalSpores, sliceSize } = fetchSporeSlice(
        config.cohortEmails,
    );

    console.log("🌱 Daily Spore Recheck");
    console.log(`   Environment: ${env}`);
    console.log(`   Mode: ${config.dryRun ? "DRY RUN" : "LIVE"}`);
    if (config.cohortEmails) {
        console.log(`   Email cohort: ${config.cohortEmails.length} users`);
    }
    console.log(`   Total spores: ${totalSpores}`);
    console.log(`   Daily target: ${sliceSize}`);
    console.log(`   Selected users: ${rows.length}`);
    if (config.traceFile) {
        console.log(`   Trace file: ${config.traceFile}`);
    }

    appendTrace(config.traceFile, {
        type: "run_start",
        run_id: runId,
        trace_pass: config.tracePass,
        dry_run: config.dryRun,
        total_spores: totalSpores,
        slice_size: sliceSize,
        selected_users: rows.length,
        cohort_size: config.cohortEmails?.length ?? null,
    });

    if (rows.length === 0) {
        console.log("✅ No spore users to process");
        appendTrace(config.traceFile, {
            type: "run_end",
            run_id: runId,
            trace_pass: config.tracePass,
            selected_users: 0,
            anomalies: 0,
        });
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
                env,
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
        appendTrace(config.traceFile, {
            type: "run_end",
            run_id: runId,
            trace_pass: config.tracePass,
            selected_users: rows.length,
            deleted_users: 0,
            unavailable_users: 0,
            risk_blocked_users: 0,
            promoted_users: 0,
            anomalies: 0,
        });
        return;
    }

    // Process in chunks of 50 users, writing to D1 after each chunk
    const GITHUB_CHUNK_SIZE = 50;
    const resultsByEmail = new Map<string, GitHubValidationResult>();
    const allScoreableResults: GitHubValidationResult[] = [];
    const totals = {
        deleted: 0,
        unavailable: 0,
        riskBlocked: 0,
        promoted: 0,
        stored: 0,
        unavailableStored: 0,
    };

    for (let ci = 0; ci < validRows.length; ci += GITHUB_CHUNK_SIZE) {
        const chunk = validRows.slice(ci, ci + GITHUB_CHUNK_SIZE);
        console.log(
            `\n⚡ GitHub chunk ${Math.floor(ci / GITHUB_CHUNK_SIZE) + 1}/${Math.ceil(validRows.length / GITHUB_CHUNK_SIZE)} (${chunk.length} users)`,
        );

        const results = await validateUserRecords(chunk);
        const {
            resultsByGithubId,
            deletedGithubIds,
            unavailableGithubIds,
            scoreableResults,
        } = bucketValidationResults(chunk, results);

        for (const row of chunk) {
            const result = resultsByGithubId.get(row.github_id);
            if (result) resultsByEmail.set(row.email, result);
        }

        allScoreableResults.push(...scoreableResults);
        const riskBlockedGithubIds =
            extractRiskBlockedGithubIds(scoreableResults);
        const approvedGithubIds = extractApprovedGithubIds(
            scoreableResults,
            riskBlockedGithubIds,
        );

        totals.deleted += deletedGithubIds.length;
        totals.unavailable += unavailableGithubIds.length;
        totals.riskBlocked += riskBlockedGithubIds.length;

        if (config.dryRun) {
            totals.promoted += approvedGithubIds.length;
            continue;
        }

        // Write to D1 immediately after each chunk
        if (deletedGithubIds.length > 0) {
            const banned = banUsersByGithubIds(env, deletedGithubIds);
            console.log(`   🚫 Banned ${banned} deleted accounts`);
        }

        const stored = storeGithubScores(env, "spore", scoreableResults);
        totals.stored += stored;

        const unavailableStored = storeGithubCheckTimestamps(
            env,
            "spore",
            unavailableGithubIds,
        );
        totals.unavailableStored += unavailableStored;

        const upgraded = upgradeUsers(approvedGithubIds);
        totals.promoted += upgraded;

        console.log(
            `   💾 Chunk done: ${stored} scored, ${upgraded} upgraded, ${deletedGithubIds.length} banned`,
        );
    }

    summarize(allScoreableResults);

    if (config.verbose) {
        console.log("\n📊 Score breakdown samples (first 20):");
        for (const result of allScoreableResults.slice(0, 20)) {
            const flags = result.risk_flags.join(", ");
            const suffix = flags ? ` | risk: ${flags}` : "";
            console.log(
                `   github_id=${result.github_id}: ${Number(result.details?.total ?? 0).toFixed(1)} (${result.reason})${suffix}`,
            );
        }
    }

    if (config.dryRun) {
        if (totals.deleted > 0)
            console.log(
                `\n🚫 Dry run would ban ${totals.deleted} users with deleted GitHub accounts`,
            );
        if (totals.riskBlocked > 0)
            console.log(
                `🚩 Dry run would keep ${totals.riskBlocked} users at spore due to suspicious GitHub profiles`,
            );
        if (totals.unavailable > 0)
            console.log(
                `⏭️ Dry run would defer ${totals.unavailable} users because GitHub scoring was unavailable`,
            );
        console.log(
            `🌱 Dry run would upgrade ${totals.promoted} users to seed`,
        );
    } else {
        console.log("\n📊 Results:");
        console.log(`   Scores stored: ${totals.stored}`);
        console.log(
            `   Deferred check timestamps stored: ${totals.unavailableStored}`,
        );
        console.log(`   Risk-blocked from seed: ${totals.riskBlocked}`);
        console.log(`   Deferred (GitHub unavailable): ${totals.unavailable}`);
        console.log(`   Upgraded to seed: ${totals.promoted}`);
    }

    // Trace all user decisions (shared between dry-run and live)
    const storedStates = config.dryRun
        ? null
        : fetchStoredUserStatesByEmail(rows.map((row) => row.email));
    let anomalies = 0;

    for (const [index, row] of rows.entries()) {
        const result = resultsByEmail.get(row.email) ?? null;
        const decision =
            !Number.isInteger(row.github_id) || row.github_id === null
                ? "ban_invalid_id"
                : classifyDecision(result);
        const postState = storedStates?.get(row.email);
        const reconcileIssue = postState
            ? reconcileDecision(decision, postState)
            : null;
        if (reconcileIssue) anomalies += 1;

        appendTrace(config.traceFile, {
            type: "user_decision",
            run_id: runId,
            trace_pass: config.tracePass,
            selected_index: index + 1,
            selected_total: rows.length,
            email: row.email,
            github_id: row.github_id,
            pre_tier: "spore",
            account_status: result?.status ?? "invalid_id",
            approved: result?.approved ?? false,
            score: result?.details?.total ?? null,
            reason: result?.reason ?? null,
            risk_status: result?.risk_status ?? null,
            risk_flags: result?.risk_flags ?? [],
            risk_details: result?.risk_details ?? null,
            decision,
            dry_run: config.dryRun,
            ...(postState && {
                post_tier: postState.tier ?? null,
                post_banned: postState.banned ?? null,
                post_ban_reason: postState.ban_reason ?? null,
                post_score: postState.score ?? null,
                post_score_checked_at: postState.score_checked_at ?? null,
            }),
            reconcile_issue: reconcileIssue,
        });
    }

    if (anomalies > 0) {
        console.warn(`⚠️ Trace reconciliation found ${anomalies} anomaly(s)`);
    }

    appendTrace(config.traceFile, {
        type: "run_end",
        run_id: runId,
        trace_pass: config.tracePass,
        selected_users: rows.length,
        deleted_users: totals.deleted,
        unavailable_users: totals.unavailable,
        risk_blocked_users: totals.riskBlocked,
        promoted_users: totals.promoted,
        anomalies,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
