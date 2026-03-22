#!/usr/bin/env npx tsx
/**
 * Hourly new-user pipeline.
 *
 * Promotes trusted microbe users (trust_score >= 60) to seed or spore based on
 * GitHub activity. Bans users with missing/invalid github_id, then scores
 * developer activity (age, repos, commits, stars) and applies a risk check.
 * Users above threshold go to seed; others go to spore. Deleted accounts are
 * banned.
 *
 * Runs after trust-score.ts has already written trust_score to D1.
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   npx tsx user-scoring/jobs/hourly-new-users.ts
 *   npx tsx user-scoring/jobs/hourly-new-users.ts --dry-run
 *   npx tsx user-scoring/jobs/hourly-new-users.ts --emails-file /tmp/emails.txt
 *   npx tsx user-scoring/jobs/hourly-new-users.ts --emails-file /tmp/emails.txt --trace-file /tmp/hourly-trace.jsonl
 *
 * Options:
 *   --dry-run        Preview actions without writing to D1
 *   --emails-file    Restrict to emails in a newline-separated file
 *   --trace-file     Append local debugging traces as JSONL
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    bucketValidationResults,
    extractApprovedGithubIds,
    extractRiskBlockedGithubIds,
    type GitHubValidationResult,
    storeGithubScores,
    validateUserRecords,
} from "../scoring/github-score.ts";
import { getString, hasFlag } from "../shared/cli.ts";
import {
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
    promoteUsersByGithubIds,
} from "../shared/github-identity.ts";
import { appendTrace } from "../shared/trace.ts";

interface ParsedArgs {
    dryRun: boolean;
    cohortEmails: string[] | null;
    traceFile: string | null;
}

interface TrustedUser {
    email: string;
    github_id: number | null;
    trust_score: number | null;
}

type HourlyDecision =
    | "ban_invalid_id"
    | "ban_deleted"
    | "defer_unavailable"
    | "promote_seed"
    | "stay_microbe_below_threshold"
    | "stay_microbe_risk_blocked"
    | "missing_result";

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const traceFile = getString(args, "--trace-file") ?? null;

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
        cohortEmails,
        traceFile,
    };
}

function fetchNewMicrobeUsers(cohortEmails: string[] | null): TrustedUser[] {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    return queryD1(
        `SELECT email, github_id, trust_score FROM user WHERE tier = 'microbe' AND trust_score IS NULL AND COALESCE(banned, 0) = 0${emailFilter}`,
    ) as TrustedUser[];
}

function classifyDecision(
    result: GitHubValidationResult | null | undefined,
): HourlyDecision {
    if (!result) return "missing_result";
    if (result.status === "github_account_deleted") return "ban_deleted";
    if (result.status === "unavailable") return "defer_unavailable";
    if (result.approved && result.risk_status === "suspicious") {
        return "stay_microbe_risk_blocked";
    }
    if (result.approved) return "promote_seed";
    return "stay_microbe_below_threshold";
}

function reconcileDecision(
    decision: HourlyDecision,
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
            return Number(state.banned ?? 0) === 0 && state.tier === "microbe"
                ? null
                : "unexpected_state_for_unavailable";
        case "promote_seed":
            return state.tier === "seed" ? null : "expected_seed_tier";
        case "stay_microbe_below_threshold":
        case "stay_microbe_risk_blocked":
            return state.tier === "microbe" ? null : "expected_microbe_tier";
        case "missing_result":
            return "missing_validation_result";
    }
}

async function main(): Promise<void> {
    const config = parseArguments();
    const runId = `${Date.now()}-${process.pid}`;
    const env = getRuntimeEnvironment();

    console.log("🚀 Hourly New-User Pipeline");
    console.log("=".repeat(50));
    console.log(`📋 Environment: ${env}`);
    if (config.dryRun) console.log("🔍 Mode: DRY RUN");
    if (config.cohortEmails) {
        console.log(`🎯 Email cohort: ${config.cohortEmails.length} users`);
    }
    if (config.traceFile) {
        console.log(`🧾 Trace file: ${config.traceFile}`);
    }

    const trustedUsers = fetchNewMicrobeUsers(config.cohortEmails);
    appendTrace(config.traceFile, {
        stage: "hourly",
        type: "run_start",
        run_id: runId,
        dry_run: config.dryRun,
        selected_users: trustedUsers.length,
        cohort_size: config.cohortEmails?.length ?? null,
    });
    if (trustedUsers.length === 0) {
        console.log("✅ No new microbe users to process");
        appendTrace(config.traceFile, {
            stage: "hourly",
            type: "run_end",
            run_id: runId,
            selected_users: 0,
            anomalies: 0,
        });
        return;
    }

    console.log(`📊 New microbe users: ${trustedUsers.length}`);

    const invalidUsers = trustedUsers.filter(
        (user) => !Number.isInteger(user.github_id) || user.github_id === null,
    );
    const validUsers = trustedUsers.filter(
        (user): user is TrustedUser & { github_id: number } =>
            Number.isInteger(user.github_id) && user.github_id !== null,
    );

    if (invalidUsers.length > 0) {
        if (config.dryRun) {
            console.log(
                `🚫 Would ban ${invalidUsers.length} trusted users with missing/invalid GitHub IDs`,
            );
        } else {
            const banned = banUsersByEmails(
                env,
                invalidUsers.map((user) => user.email),
                GITHUB_ID_INVALID_REASON,
            );
            console.log(
                `🚫 Banned ${banned} trusted users with missing/invalid GitHub IDs`,
            );
        }
    }

    if (validUsers.length === 0) {
        console.log("✅ No valid trusted users left for GitHub scoring");
        for (const [index, user] of trustedUsers.entries()) {
            appendTrace(config.traceFile, {
                stage: "hourly",
                type: "user_decision",
                run_id: runId,
                selected_index: index + 1,
                selected_total: trustedUsers.length,
                email: user.email,
                github_id: user.github_id,
                pre_tier: "microbe",
                trust_score: user.trust_score,
                account_status: "invalid_id",
                approved: false,
                score: null,
                reason: GITHUB_ID_INVALID_REASON,
                risk_status: null,
                risk_flags: [],
                risk_details: null,
                decision: "ban_invalid_id",
                dry_run: config.dryRun,
            });
        }
        appendTrace(config.traceFile, {
            stage: "hourly",
            type: "run_end",
            run_id: runId,
            selected_users: trustedUsers.length,
            deleted_users: 0,
            unavailable_users: 0,
            risk_blocked_users: 0,
            seed_users: 0,
            spore_users: 0,
            anomalies: 0,
        });
        return;
    }

    // Process in chunks of 50 users, writing to D1 after each chunk
    const GITHUB_CHUNK_SIZE = 50;
    const resultsByEmail = new Map<string, GitHubValidationResult>();
    const totals = {
        deleted: 0,
        unavailable: 0,
        riskBlocked: 0,
        seeded: 0,
        stored: 0,
    };

    for (let ci = 0; ci < validUsers.length; ci += GITHUB_CHUNK_SIZE) {
        const chunk = validUsers.slice(ci, ci + GITHUB_CHUNK_SIZE);
        console.log(
            `\n⚡ GitHub chunk ${Math.floor(ci / GITHUB_CHUNK_SIZE) + 1}/${Math.ceil(validUsers.length / GITHUB_CHUNK_SIZE)} (${chunk.length} users)`,
        );

        const results = await validateUserRecords(chunk);
        const {
            resultsByGithubId,
            deletedGithubIds,
            unavailableGithubIds,
            scoreableResults,
        } = bucketValidationResults(chunk, results);

        // Map results by email for tracing
        for (const user of chunk) {
            const result = resultsByGithubId.get(user.github_id);
            if (result) resultsByEmail.set(user.email, result);
        }

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
            totals.seeded += approvedGithubIds.length;
            continue;
        }

        // Write to D1 immediately after each chunk
        if (deletedGithubIds.length > 0) {
            const banned = banUsersByGithubIds(env, deletedGithubIds);
            console.log(`   🚫 Banned ${banned} deleted accounts`);
        }

        const stored = storeGithubScores(env, "microbe", scoreableResults);
        totals.stored += stored;

        const seeded = promoteUsersByGithubIds(
            env,
            approvedGithubIds,
            "microbe",
            "seed",
            TIER_POLLEN.seed,
        );
        totals.seeded += seeded;

        console.log(
            `   💾 Chunk done: ${stored} scored, ${seeded} seed, ${deletedGithubIds.length} banned`,
        );
    }

    if (config.dryRun) {
        if (totals.deleted > 0)
            console.log(
                `🚫 Would ban ${totals.deleted} users with deleted GitHub accounts`,
            );
        if (totals.riskBlocked > 0)
            console.log(
                `🚩 Would keep ${totals.riskBlocked} trusted users at spore due to suspicious GitHub profiles`,
            );
        if (totals.unavailable > 0)
            console.log(
                `⏭️ Would defer ${totals.unavailable} users because GitHub scoring was unavailable`,
            );
        console.log(`🌱 Would promote to seed: ${totals.seeded}`);
    } else {
        console.log("\n📊 Summary:");
        console.log(`   Scores stored: ${totals.stored}`);
        console.log(`   Risk-blocked from seed: ${totals.riskBlocked}`);
        console.log(`   Deferred (GitHub unavailable): ${totals.unavailable}`);
        console.log(`   Microbe -> Seed: ${totals.seeded}`);
    }

    // Trace all user decisions (shared between dry-run and live)
    const storedStates = config.dryRun
        ? null
        : fetchStoredUserStatesByEmail(trustedUsers.map((user) => user.email));
    let anomalies = 0;

    for (const [index, user] of trustedUsers.entries()) {
        const result = resultsByEmail.get(user.email) ?? null;
        const decision =
            !Number.isInteger(user.github_id) || user.github_id === null
                ? "ban_invalid_id"
                : classifyDecision(result);
        const state = storedStates?.get(user.email);
        const reconcileIssue = state
            ? reconcileDecision(decision, state)
            : null;
        if (reconcileIssue) anomalies += 1;
        appendTrace(config.traceFile, {
            stage: "hourly",
            type: "user_decision",
            run_id: runId,
            selected_index: index + 1,
            selected_total: trustedUsers.length,
            email: user.email,
            github_id: user.github_id,
            pre_tier: "microbe",
            trust_score: user.trust_score,
            account_status: result?.status ?? "invalid_id",
            approved: result?.approved ?? false,
            score: result?.details?.total ?? null,
            reason: result?.reason ?? null,
            risk_status: result?.risk_status ?? null,
            risk_flags: result?.risk_flags ?? [],
            risk_details: result?.risk_details ?? null,
            decision,
            dry_run: config.dryRun,
            ...(state && {
                post_tier: state.tier ?? null,
                post_banned: state.banned ?? null,
                post_ban_reason: state.ban_reason ?? null,
                post_score: state.score ?? null,
                post_score_checked_at: state.score_checked_at ?? null,
            }),
            reconcile_issue: reconcileIssue,
        });
    }

    appendTrace(config.traceFile, {
        stage: "hourly",
        type: "run_end",
        run_id: runId,
        selected_users: trustedUsers.length,
        deleted_users: totals.deleted,
        unavailable_users: totals.unavailable,
        risk_blocked_users: totals.riskBlocked,
        seed_users: totals.seeded,
        spore_users: 0,
        anomalies,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
