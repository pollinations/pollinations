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

import { appendFileSync } from "node:fs";
import { TIER_POLLEN } from "../../src/tier-config.ts";
import {
    extractDeletedGithubIds,
    type GitHubValidationResult,
    isScorableValidationResult,
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
    cohortEmails: string[] | null;
    traceFile: string | null;
}

interface TrustedUser {
    email: string;
    github_id: number | null;
    trust_score: number | null;
}

interface StoredUserState {
    email: string;
    github_id: number | null;
    tier: string | null;
    banned: number | null;
    ban_reason: string | null;
    score: number | null;
    score_checked_at: number | null;
    trust_score: number | null;
}

type HourlyDecision =
    | "ban_invalid_id"
    | "ban_deleted"
    | "defer_unavailable"
    | "promote_seed"
    | "promote_spore_below_threshold"
    | "promote_spore_risk_blocked"
    | "missing_result";

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
        traceFile,
    };
}

function fetchTrustedMicrobeUsers(
    env: Environment,
    cohortEmails: string[] | null,
): TrustedUser[] {
    const emailFilter = buildEmailFilter("email", cohortEmails);
    return queryD1(
        env,
        `SELECT email, github_id, trust_score FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0${emailFilter}`,
    ) as TrustedUser[];
}

function extractRiskBlockedGithubUsers(
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
): HourlyDecision {
    if (!result) return "missing_result";
    if (result.status === "github_account_deleted") return "ban_deleted";
    if (result.status === "unavailable") return "defer_unavailable";
    if (result.approved && result.risk_status === "suspicious") {
        return "promote_spore_risk_blocked";
    }
    if (result.approved) return "promote_seed";
    return "promote_spore_below_threshold";
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
            `SELECT email, github_id, tier, COALESCE(banned, 0) AS banned, ban_reason, score, score_checked_at, trust_score FROM user WHERE email IN (${batch
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
        case "promote_spore_below_threshold":
        case "promote_spore_risk_blocked":
            return state.tier === "spore" ? null : "expected_spore_tier";
        case "missing_result":
            return "missing_validation_result";
    }
}

async function main(): Promise<void> {
    const config = parseArguments();
    const runId = `${Date.now()}-${process.pid}`;

    console.log("🚀 Hourly New-User Pipeline");
    console.log("=".repeat(50));
    console.log(`📋 Environment: ${config.env}`);
    if (config.dryRun) console.log("🔍 Mode: DRY RUN");
    if (config.cohortEmails) {
        console.log(`🎯 Email cohort: ${config.cohortEmails.length} users`);
    }
    if (config.traceFile) {
        console.log(`🧾 Trace file: ${config.traceFile}`);
    }

    const trustedUsers = fetchTrustedMicrobeUsers(
        config.env,
        config.cohortEmails,
    );
    appendTrace(config.traceFile, {
        stage: "hourly",
        type: "run_start",
        run_id: runId,
        dry_run: config.dryRun,
        selected_users: trustedUsers.length,
        cohort_size: config.cohortEmails?.length ?? null,
    });
    if (trustedUsers.length === 0) {
        console.log("✅ No trusted microbe users ready for GitHub scoring");
        appendTrace(config.traceFile, {
            stage: "hourly",
            type: "run_end",
            run_id: runId,
            selected_users: 0,
            anomalies: 0,
        });
        return;
    }

    console.log(`📊 Trusted microbe users: ${trustedUsers.length}`);

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
                config.env,
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

    const results = await validateUserRecords(validUsers);
    const resultsByGithubId = new Map(
        results.flatMap((result) =>
            Number.isInteger(result.github_id) && result.github_id > 0
                ? [[result.github_id, result] as const]
                : [],
        ),
    );
    const orderedResults = validUsers.flatMap((user) => {
        const result = resultsByGithubId.get(user.github_id);
        return result ? [result] : [];
    });
    const resultsByEmail = new Map(
        validUsers.flatMap((user) => {
            const result = resultsByGithubId.get(user.github_id);
            return result ? [[user.email, result] as const] : [];
        }),
    );
    const deletedGithubIds = extractDeletedGithubIds(orderedResults);
    const scoreableResults = orderedResults.filter(isScorableValidationResult);
    const unavailableCount =
        orderedResults.length -
        deletedGithubIds.length -
        scoreableResults.length;
    const riskBlockedGithubIds =
        extractRiskBlockedGithubUsers(scoreableResults);
    const riskBlockedSet = new Set(riskBlockedGithubIds);
    const approvedGithubIds = scoreableResults.flatMap((result) =>
        result.approved &&
        Number.isInteger(result.github_id) &&
        !riskBlockedSet.has(result.github_id)
            ? [result.github_id]
            : [],
    );
    const sporeGithubIds = scoreableResults.flatMap((result) =>
        Number.isInteger(result.github_id) &&
        (!result.approved || riskBlockedSet.has(result.github_id))
            ? [result.github_id]
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
        if (unavailableCount > 0) {
            console.log(
                `⏭️ Would defer ${unavailableCount} users because GitHub scoring was unavailable`,
            );
        }
        console.log(`🌱 Would promote to seed: ${approvedGithubIds.length}`);
        console.log(`🍄 Would promote to spore: ${sporeGithubIds.length}`);
        for (const [index, user] of trustedUsers.entries()) {
            const result = resultsByEmail.get(user.email) ?? null;
            const decision =
                !Number.isInteger(user.github_id) || user.github_id === null
                    ? "ban_invalid_id"
                    : classifyDecision(result);
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
                dry_run: true,
            });
        }
        appendTrace(config.traceFile, {
            stage: "hourly",
            type: "run_end",
            run_id: runId,
            selected_users: trustedUsers.length,
            deleted_users: deletedGithubIds.length,
            unavailable_users: unavailableCount,
            risk_blocked_users: riskBlockedGithubIds.length,
            seed_users: approvedGithubIds.length,
            spore_users: sporeGithubIds.length,
            anomalies: 0,
        });
        return;
    }

    if (deletedGithubIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedGithubIds);
        console.log(`🚫 Banned ${banned} users with deleted GitHub accounts`);
    }

    const stored = storeGithubScores(config.env, "microbe", scoreableResults);
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
    console.log(`   Deferred (GitHub unavailable): ${unavailableCount}`);
    console.log(`   Microbe -> Seed: ${seeded}`);
    console.log(`   Microbe -> Spore: ${spored}`);

    const storedStates = fetchStoredUserStatesByEmail(
        config.env,
        trustedUsers.map((user) => user.email),
    );
    let anomalies = 0;

    for (const [index, user] of trustedUsers.entries()) {
        const result = resultsByEmail.get(user.email) ?? null;
        const decision =
            !Number.isInteger(user.github_id) || user.github_id === null
                ? "ban_invalid_id"
                : classifyDecision(result);
        const state = storedStates.get(user.email);
        const reconcileIssue = reconcileDecision(decision, state);
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
            post_tier: state?.tier ?? null,
            post_banned: state?.banned ?? null,
            post_ban_reason: state?.ban_reason ?? null,
            post_score: state?.score ?? null,
            post_score_checked_at: state?.score_checked_at ?? null,
            reconcile_issue: reconcileIssue,
        });
    }

    appendTrace(config.traceFile, {
        stage: "hourly",
        type: "run_end",
        run_id: runId,
        selected_users: trustedUsers.length,
        deleted_users: deletedGithubIds.length,
        unavailable_users: unavailableCount,
        risk_blocked_users: riskBlockedGithubIds.length,
        seed_users: seeded,
        spore_users: spored,
        anomalies,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
