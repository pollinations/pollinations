import { executeD1 } from "./d1.ts";
import { escapeSqlString } from "./email-cohort.ts";

type Environment = "staging" | "production";

export const PIPELINE_DB_BATCH_SIZE = 200;
export const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
export const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

function batchUpdate(
    env: Environment,
    column: string,
    values: string[],
): number {
    let updated = 0;
    for (let i = 0; i < values.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = values.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const ok = executeD1(
            env,
            `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE ${column} IN (${batch.join(", ")})`,
        );
        if (ok) updated += batch.length;
    }
    return updated;
}

export function banUsersByEmails(env: Environment, emails: string[]): number {
    const unique = Array.from(new Set(emails));
    const quoted = unique.map((e) => `'${escapeSqlString(e)}'`);
    return batchUpdate(env, "email", quoted);
}

export function banUsersByGithubIds(
    env: Environment,
    githubIds: number[],
): number {
    const unique = Array.from(
        new Set(
            githubIds.filter(
                (id): id is number => Number.isInteger(id) && id > 0,
            ),
        ),
    );
    return batchUpdate(env, "github_id", unique.map(String));
}
