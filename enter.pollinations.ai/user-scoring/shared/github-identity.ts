/**
 * Shared GitHub identity helpers for pipeline scripts.
 *
 * banUsersByEmails and banUsersByGithubIds are low-level helpers for directly
 * banning users in D1 by email list or github_id list.
 */

import { type Environment, executeD1ForEnv } from "./d1.ts";
import { escapeSqlString } from "./email-cohort.ts";

type Tier = "microbe" | "spore" | "seed" | "flower" | "nectar" | "router";

export const PIPELINE_DB_BATCH_SIZE = 200;
export const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
export const GITHUB_ID_INVALID_REASON = "github_id_invalid";
export const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

export type GitHubBanReason =
    | typeof GITHUB_ACCOUNT_DELETED_REASON
    | typeof GITHUB_ID_INVALID_REASON;

export function banUsersByEmails(
    env: Environment,
    emails: string[],
    reason: GitHubBanReason = GITHUB_ACCOUNT_DELETED_REASON,
): number {
    const uniqueEmails = Array.from(new Set(emails));
    const safeReason = escapeSqlString(reason);
    let banned = 0;

    for (let i = 0; i < uniqueEmails.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueEmails.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const emailList = batch
            .map((email) => `'${escapeSqlString(email)}'`)
            .join(", ");
        const ok = executeD1ForEnv(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${safeReason}' WHERE email IN (${emailList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

/**
 * Batch-promote users by github_id from one tier to another.
 * Only updates rows whose current tier matches `fromTier`.
 */
export function promoteUsersByGithubIds(
    env: Environment,
    githubIds: number[],
    fromTier: Tier,
    toTier: Tier,
    tierBalance: number,
): number {
    const uniqueIds = Array.from(
        new Set(
            githubIds.filter(
                (id): id is number => Number.isInteger(id) && id > 0,
            ),
        ),
    );
    let updated = 0;

    for (let i = 0; i < uniqueIds.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const ok = executeD1ForEnv(
            env,
            `UPDATE user SET tier = '${toTier}', tier_balance = ${tierBalance}, last_tier_grant = ${Date.now()} WHERE github_id IN (${batch.join(", ")}) AND tier = '${fromTier}'`,
        );
        if (ok) updated += batch.length;
    }

    return updated;
}

export function banUsersByGithubIds(
    env: Environment,
    githubIds: number[],
): number {
    const uniqueIds = Array.from(
        new Set(
            githubIds.filter(
                (githubId): githubId is number =>
                    Number.isInteger(githubId) && githubId > 0,
            ),
        ),
    );
    let banned = 0;

    for (let i = 0; i < uniqueIds.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const idList = batch.join(", ");
        const ok = executeD1ForEnv(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE github_id IN (${idList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}
