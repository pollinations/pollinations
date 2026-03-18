import { executeD1 } from "./d1.ts";
import { escapeSqlString } from "./email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
    GITHUB_ACCOUNT_DELETED_REASON,
    GITHUB_USERNAME_RE,
    PIPELINE_DB_BATCH_SIZE,
} from "./github-identity.ts";
import { runInlinePython } from "./python.ts";

type Environment = "staging" | "production";

export interface GithubValidationResult {
    github_id?: number | null;
    username?: string;
    status?: string;
}

export interface GithubIdentityRecord {
    email: string;
    github_id: number | null;
    github_username: string | null;
}

export interface GithubValidationOutcome<T extends GithubIdentityRecord> {
    validUsers: T[];
    missingOrInvalidUsers: T[];
    deletedGithubIds: number[];
    resolvedUsers: Array<{ github_id: number; github_username: string }>;
}

function syncGithubUsernames(
    env: Environment,
    users: Array<{ github_id: number; github_username: string }>,
): number {
    const uniqueUsers = Array.from(
        new Map(
            users
                .filter(
                    (user) =>
                        Number.isInteger(user.github_id) &&
                        user.github_id > 0 &&
                        typeof user.github_username === "string" &&
                        GITHUB_USERNAME_RE.test(user.github_username),
                )
                .map((user) => [user.github_id, user]),
        ).values(),
    );
    let updated = 0;

    for (let i = 0; i < uniqueUsers.length; i += PIPELINE_DB_BATCH_SIZE) {
        const batch = uniqueUsers.slice(i, i + PIPELINE_DB_BATCH_SIZE);
        if (batch.length === 0) continue;

        const usernameCases = batch
            .map(
                ({ github_id, github_username }) =>
                    `WHEN ${github_id} THEN '${escapeSqlString(github_username)}'`,
            )
            .join(" ");
        const idList = batch.map(({ github_id }) => github_id).join(", ");
        const ok = executeD1(
            env,
            `UPDATE user SET github_username = CASE github_id ${usernameCases} END WHERE github_id IN (${idList})`,
        );
        if (ok) updated += batch.length;
    }

    return updated;
}

export function runGithubValidation<T extends GithubIdentityRecord>(
    users: T[],
    scriptDir: string,
): GithubValidationResult[] {
    if (users.length === 0) return [];

    const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptDir}")
from github_score import validate_account_records
results = validate_account_records(${JSON.stringify(users)})
print(json.dumps(results))
`;

    const output = runInlinePython(pythonScript);
    return JSON.parse(output.trim()) as GithubValidationResult[];
}

export function validateGithubAccounts<T extends GithubIdentityRecord>(
    users: T[],
    env: Environment,
    scriptDir: string,
    options: {
        applyChanges: boolean;
        missingLabel: string;
        deletedLabel: string;
        syncLabel: string;
    },
): GithubValidationOutcome<T> {
    if (users.length === 0) {
        return {
            validUsers: [],
            missingOrInvalidUsers: [],
            deletedGithubIds: [],
            resolvedUsers: [],
        };
    }

    const missingOrInvalidUsers = users.filter(
        (user) => !Number.isInteger(user.github_id) || user.github_id === null,
    );
    const usersWithGithub = users.filter(
        (user): user is T & { github_id: number } =>
            Number.isInteger(user.github_id) && user.github_id !== null,
    );

    if (missingOrInvalidUsers.length > 0) {
        if (options.applyChanges) {
            const banned = banUsersByEmails(
                env,
                missingOrInvalidUsers.map((user) => user.email),
            );
            console.log(`🚫 ${options.missingLabel}: ${banned}`);
        } else {
            console.log(
                `🚫 Would ${options.missingLabel.toLowerCase()}: ${missingOrInvalidUsers.length}`,
            );
        }
    }

    if (usersWithGithub.length === 0) {
        return {
            validUsers: [],
            missingOrInvalidUsers,
            deletedGithubIds: [],
            resolvedUsers: [],
        };
    }

    const results = runGithubValidation(usersWithGithub, scriptDir);
    const deletedGithubIds = Array.from(
        new Set(
            results.flatMap((result) =>
                result.status === GITHUB_ACCOUNT_DELETED_REASON &&
                Number.isInteger(result.github_id)
                    ? [result.github_id]
                    : [],
            ),
        ),
    );
    const resolvedUsers = results.flatMap((result) =>
        Number.isInteger(result.github_id) &&
        typeof result.username === "string" &&
        GITHUB_USERNAME_RE.test(result.username)
            ? [
                  {
                      github_id: result.github_id,
                      github_username: result.username,
                  },
              ]
            : [],
    );

    if (resolvedUsers.length > 0) {
        if (options.applyChanges) {
            const updated = syncGithubUsernames(env, resolvedUsers);
            if (updated > 0) {
                console.log(`🔄 ${options.syncLabel}: ${updated}`);
            }
        } else {
            console.log(
                `🔄 Would ${options.syncLabel.toLowerCase()}: ${resolvedUsers.length}`,
            );
        }
    }

    if (deletedGithubIds.length > 0) {
        if (options.applyChanges) {
            const banned = banUsersByGithubIds(env, deletedGithubIds);
            console.log(`🚫 ${options.deletedLabel}: ${banned}`);
        } else {
            console.log(
                `🚫 Would ${options.deletedLabel.toLowerCase()}: ${deletedGithubIds.length}`,
            );
        }
    }

    const resultsByGithubId = new Map(
        results.flatMap((result) =>
            Number.isInteger(result.github_id)
                ? [[result.github_id, result] as const]
                : [],
        ),
    );
    const deletedSet = new Set(deletedGithubIds);
    const validUsers = usersWithGithub.flatMap((user) => {
        if (deletedSet.has(user.github_id)) {
            return [];
        }

        const result = resultsByGithubId.get(user.github_id);
        const github_username =
            typeof result?.username === "string" &&
            GITHUB_USERNAME_RE.test(result.username)
                ? result.username
                : user.github_username;
        if (
            typeof github_username !== "string" ||
            !GITHUB_USERNAME_RE.test(github_username)
        ) {
            return [];
        }

        return [{ ...user, github_username }];
    });

    return {
        validUsers,
        missingOrInvalidUsers,
        deletedGithubIds,
        resolvedUsers,
    };
}
