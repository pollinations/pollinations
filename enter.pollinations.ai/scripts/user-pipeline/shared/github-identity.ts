import { executeD1 } from "./d1.ts";
import { escapeSqlString } from "./email-cohort.ts";

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
