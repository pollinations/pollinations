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

import { appendFileSync } from "node:fs";
import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    extractDeletedGithubIds,
    type GitHubValidationResult,
    isScorableValidationResult,
    storeGithubCheckTimestamps,
    storeGithubScores,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { executeD1, queryD1 } from "../shared/d1.ts";
import {
    buildEmailFilter,
    escapeSqlString,
    loadEmailCohort,
} from "../shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_ID_INVALID_REASON,
    PIPELINE_DB_BATCH_SIZE,
} from "../shared/github-identity.ts";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
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

interface StoredUserState {
    email: string;
    github_id: number | null;
    tier: string | null;
    banned: number | null;
    ban_reason: string | null;
    score: number | null;
    score_checked_at: number | null;
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
    const getString = (flag: string): string | undefined => {
        const index = args.indexOf(flag);
        return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
    };
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";
    const emailsFile = getString("--emails-file");
    const traceFile = getString("--trace-file") ?? null;
    const tracePassRaw = getString("--trace-pass");
    const tracePass = tracePassRaw ? Number.parseInt(tracePassRaw, 10) : null;

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
        traceFile,
        tracePass:
            tracePass !== null && Number.isFinite(tracePass) ? tracePass : null,
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

function extractUnavailableGithubIds(
    results: GitHubValidationResult[],
): number[] {
    return Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === "unavailable" &&
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

function appendTrace(
    traceFile: string | null,
    payload: Record<string, unknown>,
): void {
    if (!traceFile) return;
    appendFileSync(
        traceFile,
        `${JSON.stringify({
            timestamp: new Date().toISOString(),
            ...payload,
        })}\n`,
    );
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

function fetchStoredUserStatesByEmail(
    env: Environment,
    emails: string[],
): Map<string, StoredUserState> {
    const states = new Map<string, StoredUserState>();
    const uniqueEmails = Array.from(new Set(emails));

    for (
        let index = 0;
        index < uniqueEmails.length;
        index += PIPELINE_DB_BATCH_SIZE
    ) {
        const batch = uniqueEmails.slice(index, index + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const rows = queryD1(
            env,
            `SELECT email, github_id, tier, COALESCE(banned, 0) AS banned, ban_reason, score, score_checked_at FROM user WHERE email IN (${batch
                .map((email) => `'${escapeSqlString(email)}'`)
                .join(", ")})`,
        ) as StoredUserState[];

        for (const row of rows) {
            states.set(row.email, row);
        }
    }

    return states;
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
    const unavailableGithubIds = extractUnavailableGithubIds(orderedResults);
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
    const resultsByEmail = new Map(
        validRows.flatMap((row) => {
            const result = resultsByGithubId.get(row.github_id);
            return result ? [[row.email, result] as const] : [];
        }),
    );

    summarize(scoreableResults);

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

        for (const [index, row] of rows.entries()) {
            const result = resultsByEmail.get(row.email) ?? null;
            const decision =
                !Number.isInteger(row.github_id) || row.github_id === null
                    ? "ban_invalid_id"
                    : classifyDecision(result);
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
                dry_run: true,
            });
        }
        appendTrace(config.traceFile, {
            type: "run_end",
            run_id: runId,
            trace_pass: config.tracePass,
            selected_users: rows.length,
            deleted_users: deletedGithubIds.length,
            unavailable_users: unavailableCount,
            risk_blocked_users: riskBlockedGithubIds.length,
            promoted_users: approvedGithubIds.length,
            anomalies: 0,
        });
        return;
    }

    if (deletedGithubIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedGithubIds);
        console.log(`\n🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const stored = storeGithubScores(config.env, "spore", scoreableResults);
    const unavailableStored = storeGithubCheckTimestamps(
        config.env,
        "spore",
        unavailableGithubIds,
    );
    const upgraded = upgradeUsers(config.env, approvedGithubIds);
    const storedStates = fetchStoredUserStatesByEmail(
        config.env,
        rows.map((row) => row.email),
    );
    let anomalies = 0;

    for (const [index, row] of rows.entries()) {
        const result = resultsByEmail.get(row.email) ?? null;
        const decision =
            !Number.isInteger(row.github_id) || row.github_id === null
                ? "ban_invalid_id"
                : classifyDecision(result);
        const postState = storedStates.get(row.email);
        const reconcileIssue = reconcileDecision(decision, postState);
        if (reconcileIssue) {
            anomalies += 1;
        }

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
            post_tier: postState?.tier ?? null,
            post_banned: postState?.banned ?? null,
            post_ban_reason: postState?.ban_reason ?? null,
            post_score: postState?.score ?? null,
            post_score_checked_at: postState?.score_checked_at ?? null,
            reconcile_issue: reconcileIssue,
            dry_run: false,
        });
    }

    if (anomalies > 0) {
        console.warn(`⚠️ Trace reconciliation found ${anomalies} anomaly(s)`);
    }

    console.log("\n📊 Results:");
    console.log(`   Scores stored: ${stored}`);
    console.log(`   Deferred check timestamps stored: ${unavailableStored}`);
    console.log(`   Risk-blocked from seed: ${riskBlockedGithubIds.length}`);
    console.log(`   Deferred (GitHub unavailable): ${unavailableCount}`);
    console.log(`   Upgraded to seed: ${upgraded}`);
    appendTrace(config.traceFile, {
        type: "run_end",
        run_id: runId,
        trace_pass: config.tracePass,
        selected_users: rows.length,
        deleted_users: deletedGithubIds.length,
        unavailable_users: unavailableCount,
        risk_blocked_users: riskBlockedGithubIds.length,
        promoted_users: approvedGithubIds.length,
        anomalies,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
