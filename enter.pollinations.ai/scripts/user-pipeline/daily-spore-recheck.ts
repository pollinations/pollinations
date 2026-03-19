#!/usr/bin/env npx tsx
/**
 * Daily spore recheck for seed tier eligibility.
 *
 * Rechecks the oldest 1/7th of spore users daily, upgrading qualified ones to seed.
 */

import { TIER_POLLEN } from "../../src/tier-config.ts";
import { queryD1 } from "./shared/d1.ts";
import { buildEmailFilter } from "./shared/email-cohort.ts";
import {
    banUsersByEmails,
    banUsersByGithubIds,
} from "./shared/github-identity.ts";
import {
    applyTierUpdates,
    classifyResults,
    type PipelineUser,
    parsePipelineArgs,
    runGithubScoring,
    storeScores,
} from "./shared/scoring-pipeline.ts";

const MAX_USERS_PER_RUN = 8000;

function fetchSporeSlice(
    env: string,
    cohortEmails: string[] | null,
): { users: PipelineUser[]; totalSpores: number; sliceSize: number } {
    const emailFilter = buildEmailFilter("email", cohortEmails);

    const countRows = queryD1(
        env,
        `SELECT COUNT(*) as count FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter}`,
    );
    const totalSpores = Number(countRows[0]?.count ?? 0);
    if (totalSpores === 0) return { users: [], totalSpores: 0, sliceSize: 0 };

    const sliceSize = Math.min(Math.ceil(totalSpores / 7), MAX_USERS_PER_RUN);

    const users = queryD1(
        env,
        `SELECT email, github_id, github_username FROM user WHERE tier = 'spore' AND COALESCE(banned, 0) = 0${emailFilter} ORDER BY score_checked_at ASC, created_at ASC, email ASC LIMIT ${sliceSize}`,
    ) as PipelineUser[];

    return { users, totalSpores, sliceSize };
}

function main(): void {
    const config = parsePipelineArgs();

    console.log(
        `Daily Spore Recheck [${config.env}]${config.dryRun ? " DRY RUN" : ""}`,
    );

    const { users, totalSpores, sliceSize } = fetchSporeSlice(
        config.env,
        config.cohortEmails,
    );
    console.log(
        `Total spores: ${totalSpores}, daily target: ${sliceSize}, selected: ${users.length}`,
    );

    if (users.length === 0) {
        console.log("No spore users to process");
        return;
    }

    const invalidGithubUsers = users.filter(
        (u) => !Number.isInteger(u.github_id),
    );
    const validUsers = users.filter((u) => Number.isInteger(u.github_id));

    if (invalidGithubUsers.length > 0) {
        if (config.dryRun) {
            console.log(
                `Would ban ${invalidGithubUsers.length} spore users with missing GitHub IDs`,
            );
        } else {
            const banned = banUsersByEmails(
                config.env,
                invalidGithubUsers.map((u) => u.email),
            );
            console.log(`Banned ${banned} spore users with missing GitHub IDs`);
        }
    }

    if (validUsers.length === 0) {
        console.log("No valid spore users left for GitHub scoring");
        return;
    }

    const results = runGithubScoring(validUsers);
    const { deletedIds, riskBlockedIds, approvedIds, scoreableResults } =
        classifyResults(results);

    if (config.dryRun) {
        if (deletedIds.length > 0)
            console.log(
                `Would ban ${deletedIds.length} deleted GitHub accounts`,
            );
        if (riskBlockedIds.length > 0)
            console.log(
                `Would keep ${riskBlockedIds.length} at spore (suspicious)`,
            );
        console.log(`Would upgrade ${approvedIds.length} to seed`);
        return;
    }

    if (deletedIds.length > 0) {
        const banned = banUsersByGithubIds(config.env, deletedIds);
        console.log(`Banned ${banned} deleted GitHub accounts`);
    }

    const stored = storeScores(
        config.env,
        scoreableResults,
        Date.now(),
        "spore",
    );
    const upgraded = applyTierUpdates(
        config.env,
        approvedIds,
        "seed",
        TIER_POLLEN.seed,
        "spore",
    );

    console.log(
        `Summary: ${stored} scored, ${riskBlockedIds.length} risk-blocked, ${upgraded} -> seed`,
    );
}

main();
