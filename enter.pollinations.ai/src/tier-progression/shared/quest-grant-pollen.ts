
import { execSync } from "node:child_process";
import { command, number, run, string } from "@drizzle-team/brocli";

type Environment = "staging" | "production";

function sanitizeGitHubUsername(username: string): string {
    const sanitized = username.replace(/[^a-zA-Z0-9-]/g, "");
    if (sanitized.length === 0 || sanitized.length > 39) {
        throw new Error(`Invalid GitHub username: "${username}"`);
    }
    return sanitized;
}

function queryD1(env: Environment, sql: string): string {
    const envFlag = env === "production" ? "--env production" : "--env staging";
    const cmd = `npx wrangler d1 execute DB --remote ${envFlag} --command "${sql}" --json`;
    return execSync(cmd, {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    });
}

interface D1User {
    id: string;
    github_username: string;
    pack_balance: number | null;
}

function getUser(env: Environment, githubUsername: string): D1User | null {
    const safe = sanitizeGitHubUsername(githubUsername);
    const sql = `SELECT id, github_username, pack_balance FROM user WHERE LOWER(github_username) = LOWER('${safe}') LIMIT 1;`;
    const raw = queryD1(env, sql);
    const parsed = JSON.parse(raw);
    const results = parsed[0]?.results || parsed.results || [];
    return results[0] ?? null;
}

const grantCommand = command({
    name: "grant",
    desc: "Add Pollen to a user's pack_balance (idempotency is the caller's responsibility)",
    options: {
        githubUsername: string().required().desc("GitHub username of the recipient"),
        amount: number().required().desc("Pollen amount to add (positive number)"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const amount = opts.amount;

        if (!Number.isFinite(amount) || amount <= 0) {
            console.error(`❌ Amount must be a positive number, got: ${amount}`);
            process.exit(1);
        }

        const user = getUser(env, opts.githubUsername);
        if (!user) {
            console.log(`NOT_FOUND github_username=${opts.githubUsername}`);
            process.exit(2);
        }

        const sql = `UPDATE user SET pack_balance = COALESCE(pack_balance, 0) + ${amount} WHERE id = '${user.id}';`;
        queryD1(env, sql);

        const previous = user.pack_balance ?? 0;
        console.log(
            `GRANTED user_id=${user.id} github_username=${user.github_username} previous=${previous} added=${amount} new=${previous + amount}`,
        );
    },
});

run([grantCommand]);
