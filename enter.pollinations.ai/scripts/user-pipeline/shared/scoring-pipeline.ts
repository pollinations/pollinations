/**
 * Shared logic for pipeline orchestration scripts (hourly + daily).
 */

import { executeD1 } from "./d1.ts";
import { escapeSqlString, loadEmailCohort } from "./email-cohort.ts";
import {
    GITHUB_ACCOUNT_DELETED_REASON,
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
} from "./github-identity.ts";
import { runInlinePython } from "./python.ts";

export interface ValidationResult {
    github_id?: number | null;
    username?: string;
    status?: string;
    approved?: boolean;
    risk_status?: "ok" | "suspicious" | "unavailable";
    risk_flags?: string[];
    details?: { total?: number } | null;
}

export interface PipelineUser {
    email: string;
    github_id: number | null;
    github_username: string | null;
}

export interface PipelineArgs {
    env: "staging";
    dryRun: boolean;
    cohortEmails: string[] | null;
}

export interface ClassifiedResults {
    deletedIds: number[];
    riskBlockedIds: number[];
    approvedIds: number[];
    scoreableResults: ValidationResult[];
}

export function parsePipelineArgs(): PipelineArgs {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";

    if (env !== "staging") {
        console.error(`Unsupported --env ${env}. Locked to staging.`);
        process.exit(1);
    }

    const emailsFileIndex = args.indexOf("--emails-file");
    const emailsFile =
        emailsFileIndex >= 0 ? args[emailsFileIndex + 1] : undefined;

    return {
        env: "staging",
        dryRun: args.includes("--dry-run"),
        cohortEmails: loadEmailCohort(emailsFile),
    };
}

export function runGithubScoring(
    users: PipelineUser[] | Record<string, unknown>[],
): ValidationResult[] {
    if (users.length === 0) return [];

    const scriptPath = `${import.meta.dirname}/../scoring`;
    const output = runInlinePython(`
import sys, json
sys.path.insert(0, "${scriptPath}")
from github_score import validate_user_records
results = validate_user_records(${JSON.stringify(users)})
print(json.dumps(results))
`);
    return JSON.parse(output.trim()) as ValidationResult[];
}

export function extractGithubIdsByPredicate(
    results: ValidationResult[],
    predicate: (r: ValidationResult) => boolean,
): number[] {
    return [
        ...new Set(
            results
                .filter(
                    (r) =>
                        predicate(r) &&
                        Number.isInteger(r.github_id) &&
                        (r.github_id as number) > 0,
                )
                .map((r) => r.github_id as number),
        ),
    ];
}

/**
 * Classify scoring results into deleted, risk-blocked, and approved buckets.
 */
export function classifyResults(
    results: ValidationResult[],
): ClassifiedResults {
    const deletedIds = extractGithubIdsByPredicate(
        results,
        (r) => r.status === GITHUB_ACCOUNT_DELETED_REASON,
    );
    const deletedSet = new Set(deletedIds);
    const scoreableResults = results.filter(
        (r) =>
            Number.isInteger(r.github_id) &&
            !deletedSet.has(r.github_id as number),
    );

    const riskBlockedIds = extractGithubIdsByPredicate(
        scoreableResults,
        (r) => r.risk_status === "suspicious",
    );
    const riskBlockedSet = new Set(riskBlockedIds);

    const approvedIds = extractGithubIdsByPredicate(
        scoreableResults,
        (r) => !!r.approved && !riskBlockedSet.has(r.github_id as number),
    );

    return { deletedIds, riskBlockedIds, approvedIds, scoreableResults };
}

export function applyTierUpdates(
    env: string,
    githubIds: number[],
    targetTier: string,
    tierBalance: number,
    sourceTier: string,
): number {
    const uniqueIds = [...new Set(githubIds.filter((id) => id > 0))];
    let updated = 0;

    for (let i = 0; i < uniqueIds.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        const idList = batch.join(", ");
        if (
            executeD1(
                env,
                `UPDATE user SET tier = '${targetTier}', tier_balance = ${tierBalance} WHERE github_id IN (${idList}) AND tier = '${sourceTier}'`,
            )
        ) {
            updated += batch.length;
        }
    }

    return updated;
}

export function storeScores(
    env: string,
    results: ValidationResult[],
    timestamp: number,
    tierFilter: string,
): number {
    let stored = 0;

    for (let i = 0; i < results.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = results
            .slice(i, i + PIPELINE_DB_BATCH_SIZE)
            .filter(
                (
                    r,
                ): r is ValidationResult & {
                    github_id: number;
                    username: string;
                } =>
                    Number.isInteger(r.github_id) &&
                    (r.github_id as number) > 0 &&
                    typeof r.username === "string" &&
                    GITHUB_USERNAME_RE.test(r.username),
            )
            .map((r) => ({
                githubId: r.github_id,
                username: r.username,
                score: Number(r.details?.total ?? 0) || 0,
            }));
        if (batch.length === 0) continue;

        const scoreCases = batch
            .map((b) => `WHEN ${b.githubId} THEN ${b.score}`)
            .join(" ");
        const usernameCases = batch
            .map(
                (b) =>
                    `WHEN ${b.githubId} THEN '${escapeSqlString(b.username)}'`,
            )
            .join(" ");
        const idList = batch.map((b) => b.githubId).join(", ");

        if (
            executeD1(
                env,
                `UPDATE user SET score = CASE github_id ${scoreCases} END, github_username = CASE github_id ${usernameCases} END, score_checked_at = ${timestamp} WHERE github_id IN (${idList}) AND tier = '${tierFilter}'`,
            )
        ) {
            stored += batch.length;
        }
    }

    return stored;
}
