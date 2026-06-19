import { execFileSync } from "node:child_process";
import { command, number, run, string } from "@drizzle-team/brocli";
import type { Bucket } from "@shared/billing/deduction.ts";
import { MAX_REWARD_GRANT_AMOUNT } from "@shared/billing/grant-reward.ts";

type Environment = "staging" | "production";

function sqlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function queryD1(env: Environment, sql: string): string {
    return execFileSync(
        "npx",
        [
            "wrangler",
            "d1",
            "execute",
            "DB",
            "--remote",
            "--env",
            env,
            "--command",
            sql,
            "--json",
        ],
        {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        },
    );
}

interface D1User {
    id: string;
    github_id: number | null;
    github_username: string;
    tier_balance: number | null;
    pack_balance: number | null;
}

function getUserByGithubId(env: Environment, githubId: number): D1User | null {
    const sql = `SELECT id, github_id, github_username, tier_balance, pack_balance FROM user WHERE github_id = ${githubId} LIMIT 1;`;
    const raw = queryD1(env, sql);
    const parsed = JSON.parse(raw);
    const results = parsed[0]?.results || parsed.results || [];
    return results[0] ?? null;
}

const grantCommand = command({
    name: "grant",
    desc: "Add Pollen to a user's pack_balance once for a quest payout",
    options: {
        githubId: number()
            .required()
            .desc("Immutable numeric GitHub user ID of the recipient"),
        githubUsername: string()
            .required()
            .desc("GitHub username (for logging, not used for D1 lookup)"),
        amount: number()
            .required()
            .desc("Pollen amount to add (positive number)"),
        questIssue: number().required().desc("Quest issue number"),
        prNumber: number().required().desc("Merged PR number"),
        issueTitle: string()
            .default("")
            .desc("Quest issue title for reward metadata"),
        issueUrl: string()
            .default("")
            .desc("Quest issue URL for reward metadata"),
        role: string()
            .default("assignee")
            .desc("Quest recipient role for the idempotency key"),
        bucket: string()
            .enum("pack", "tier")
            .default("pack")
            .desc("Balance bucket to credit"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const { amount, questIssue, prNumber, githubId, role } = opts;
        const bucket = opts.bucket as Bucket;
        const issueTitle = opts.issueTitle.trim();
        const issueUrl = opts.issueUrl.trim();
        const env = opts.env as Environment;

        if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            amount > MAX_REWARD_GRANT_AMOUNT
        ) {
            console.error(
                `❌ Amount must be a positive number ≤ ${MAX_REWARD_GRANT_AMOUNT}, got: ${amount}`,
            );
            process.exit(1);
        }
        if (!Number.isInteger(githubId) || githubId <= 0) {
            console.error(
                `❌ githubId must be a positive integer, got: ${githubId}`,
            );
            process.exit(1);
        }
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(role)) {
            console.error(`❌ role must be a lowercase token, got: ${role}`);
            process.exit(1);
        }
        const user = getUserByGithubId(env, githubId);
        if (!user) {
            console.log(
                `NOT_FOUND github_id=${githubId} github_username=${opts.githubUsername}`,
            );
            process.exit(2);
        }

        // Idempotency key is quest-scoped and uses the immutable github_id.
        const payoutKey = `quest:${questIssue}:gh:${githubId}:role:${role}`;
        const balanceColumn =
            bucket === "tier" ? "tier_balance" : "pack_balance";
        const metadataJson = JSON.stringify({
            questTypeId: "github:community_issue_quest",
            issueNumber: questIssue,
            ...(issueTitle ? { issueTitle } : {}),
            ...(issueUrl ? { issueUrl } : {}),
            prNumber,
            role,
            githubUsername: user.github_username,
        });
        const sql = `
            INSERT OR IGNORE INTO reward_grants (
                id,
                idempotency_key,
                user_id,
                source,
                quest_id,
                pollen_credited,
                balance_bucket,
                source_ref,
                metadata_json
            ) VALUES (
                ${sqlString(payoutKey)},
                ${sqlString(payoutKey)},
                ${sqlString(user.id)},
                'code_quest',
                'github:community_issue_quest',
                ${amount},
                ${sqlString(bucket)},
                ${sqlString(`pr:${prNumber}`)},
                ${sqlString(metadataJson)}
            );
            UPDATE user
            SET ${balanceColumn} = COALESCE(${balanceColumn}, 0) + ${amount}
            WHERE id = ${sqlString(user.id)} AND changes() = 1;
        `;

        const raw = queryD1(env, sql);
        const result = JSON.parse(raw);
        const insertResult = Array.isArray(result) ? result[0] : result;
        const updateResult = Array.isArray(result) ? result[1] : null;
        const inserted = Number(insertResult?.meta?.changes ?? 0);
        const updated = Number(updateResult?.meta?.changes ?? 0);
        if (inserted === 0) {
            console.log(`DUPLICATE payout_key=${payoutKey}`);
            process.exit(3);
        }
        if (updated !== 1) {
            throw new Error(
                `Payout row inserted but user balance update affected ${updated} rows`,
            );
        }

        const previous =
            bucket === "tier"
                ? (user.tier_balance ?? 0)
                : (user.pack_balance ?? 0);
        console.log(
            `GRANTED payout_key=${payoutKey} user_id=${user.id} github_username=${user.github_username} bucket=${bucket} previous=${previous} added=${amount} new=${previous + amount}`,
        );
    },
});

run([grantCommand]);
