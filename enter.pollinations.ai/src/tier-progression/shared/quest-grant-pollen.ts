import { execFileSync } from "node:child_process";
import { command, number, run, string } from "@drizzle-team/brocli";
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
    pack_balance: number | null;
}

function getUserByGithubId(env: Environment, githubId: number): D1User | null {
    const sql = `SELECT id, github_id, github_username, pack_balance FROM user WHERE github_id = ${githubId} LIMIT 1;`;
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
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const { amount, questIssue, prNumber, githubId } = opts;
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
        const user = getUserByGithubId(env, githubId);
        if (!user) {
            console.log(
                `NOT_FOUND github_id=${githubId} github_username=${opts.githubUsername}`,
            );
            process.exit(2);
        }

        // Idempotency key is quest-scoped and uses the immutable github_id.
        const payoutKey = `quest:${questIssue}:gh:${githubId}:role:assignee`;
        // Dual-write: keep the legacy quest_payout_credits ledger (unchanged —
        // still the idempotency gate that guards the balance credit via
        // `changes() = 1`) AND mirror the grant into the generic reward_grants
        // ledger so every reward type (code quests, product quests, manual
        // grants) shares one queryable table. The reward_grants insert reuses
        // the same payoutKey for idempotency and is best-effort (OR IGNORE).
        const rewardGrantId = `quest:${questIssue}:gh:${githubId}`;
        const sql = `
            INSERT OR IGNORE INTO quest_payout_credits (
                payout_key,
                quest_issue_number,
                pr_number,
                role,
                github_username,
                user_id,
                pollen_credited
            ) VALUES (
                ${sqlString(payoutKey)},
                ${questIssue},
                ${prNumber},
                'assignee',
                ${sqlString(user.github_username)},
                ${sqlString(user.id)},
                ${amount}
            );
            UPDATE user
            SET pack_balance = COALESCE(pack_balance, 0) + ${amount}
            WHERE id = ${sqlString(user.id)} AND changes() = 1;
            INSERT OR IGNORE INTO reward_grants (
                id,
                idempotency_key,
                user_id,
                source,
                quest_id,
                pollen_credited,
                balance_bucket,
                source_ref
            ) VALUES (
                ${sqlString(rewardGrantId)},
                ${sqlString(payoutKey)},
                ${sqlString(user.id)},
                'code_quest',
                ${sqlString(String(questIssue))},
                ${amount},
                'pack',
                ${sqlString(`pr-${prNumber}`)}
            );
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

        const previous = user.pack_balance ?? 0;
        console.log(
            `GRANTED payout_key=${payoutKey} user_id=${user.id} github_username=${user.github_username} previous=${previous} added=${amount} new=${previous + amount}`,
        );
    },
});

run([grantCommand]);
