/**
 * Shared GitHub account validation step for pipeline scripts.
 *
 * validateGithubAccounts is the canonical pre-step called before any scoring:
 * it bans users with missing/invalid github_id, then checks each account via
 * the GitHub REST API and bans accounts that return 404 (deleted).
 * Returns only users with valid, existing GitHub accounts.
 *
 * banUsersByEmails and banUsersByGithubIds are low-level helpers for directly
 * banning users in D1 by email list or github_id list.
 */

import { executeD1 } from "./d1.ts";
import { escapeSqlString } from "./email-cohort.ts";
import { validateAccountRecords } from "../scoring/github-score.ts";

type Environment = "staging" | "production";

export const PIPELINE_DB_BATCH_SIZE = 200;
export const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
export const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

export function banUsersByEmails(env: Environment, emails: string[]): number {
    const uniqueEmails = Array.from(new Set(emails));
    let banned = 0;

    for (let i = 0; i < uniqueEmails.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueEmails.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const emailList = batch
            .map((email) => `'${escapeSqlString(email)}'`)
            .join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE email IN (${emailList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}

export interface GithubValidatableUser {
    email: string;
    github_id: number | null;
}

/**
 * Validates GitHub account existence for a list of users.
 * Bans users with missing/invalid GitHub IDs and users whose accounts have been deleted.
 * Returns only users with valid, existing GitHub accounts.
 * Rate limits are handled internally by validateAccountRecords.
 */
export async function validateGithubAccounts<T extends GithubValidatableUser>(
    users: T[],
    env: Environment,
    applyChanges: boolean,
): Promise<(T & { github_id: number })[]> {
    if (users.length === 0) return [];

    const invalid = users.filter(
        (u) => !Number.isInteger(u.github_id) || u.github_id === null,
    );
    const valid = users.filter(
        (u): u is T & { github_id: number } =>
            Number.isInteger(u.github_id) && u.github_id !== null,
    );

    if (invalid.length > 0) {
        if (applyChanges) {
            const banned = banUsersByEmails(env, invalid.map((u) => u.email));
            console.log(`🚫 Banned ${banned} users with missing/invalid GitHub IDs`);
        } else {
            console.log(`🚫 Detected ${invalid.length} users with missing/invalid GitHub IDs`);
        }
    }

    if (valid.length === 0) return [];

    const results = await validateAccountRecords(valid);
    const deletedIds = Array.from(
        new Set(
            results.flatMap((r) =>
                r.status === GITHUB_ACCOUNT_DELETED_REASON && Number.isInteger(r.github_id)
                    ? [r.github_id as number]
                    : [],
            ),
        ),
    );

    if (deletedIds.length > 0) {
        if (applyChanges) {
            const banned = banUsersByGithubIds(env, deletedIds);
            console.log(`🚫 Banned ${banned} users with deleted GitHub accounts`);
        } else {
            console.log(`🚫 Detected ${deletedIds.length} users with deleted GitHub accounts`);
        }
    }

    const deletedSet = new Set(deletedIds);
    return valid.filter((u) => !deletedSet.has(u.github_id));
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
        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE github_id IN (${idList})`,
        );
        if (ok) banned += batch.length;
    }

    return banned;
}
