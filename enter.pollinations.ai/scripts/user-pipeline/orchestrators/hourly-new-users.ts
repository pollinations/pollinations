#!/usr/bin/env npx tsx
/**
 * Hourly New-User Pipeline: Microbe → Spore → Seed
 *
 * Phase 1: Promote microbe users who passed abuse check (trust_score >= 60) to spore
 * Phase 2: Check GitHub profiles for just-upgraded spore users → seed if eligible
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts               # Staging
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts --env staging # Staging
 *   npx tsx scripts/user-pipeline/orchestrators/hourly-new-users.ts --dry-run     # Preview only
 */

import { execSync } from "node:child_process";

type Environment = "staging";

interface ParsedArgs {
    env: Environment;
    dryRun: boolean;
    allowBacklog: boolean;
    backlogThreshold: number;
}

type D1Row = Record<string, string | number | null>;
interface ValidationResult {
    username?: string;
    status?: string;
    approved?: boolean;
    details?: {
        total?: number;
    } | null;
}
const DEFAULT_BACKLOG_THRESHOLD = 500;
const GITHUB_ACCOUNT_DELETED_REASON = "github_account_deleted";
const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]+$/;

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1] ? args[envIndex + 1] : "staging";
    const thresholdIndex = args.indexOf("--backlog-threshold");
    const backlogThreshold =
        thresholdIndex >= 0 && args[thresholdIndex + 1]
            ? Number(args[thresholdIndex + 1])
            : DEFAULT_BACKLOG_THRESHOLD;

    if (env !== "staging") {
        console.error(
            `❌ Unsupported --env ${env}. This branch is locked to staging and cannot write to production.`,
        );
        process.exit(1);
    }
    if (!Number.isFinite(backlogThreshold) || backlogThreshold < 0) {
        console.error("❌ --backlog-threshold must be a non-negative number.");
        process.exit(1);
    }

    return {
        env: "staging",
        dryRun: args.includes("--dry-run"),
        allowBacklog: args.includes("--allow-backlog"),
        backlogThreshold,
    };
}

function queryD1(env: Environment, sql: string): D1Row[] {
    // Safe: sql is constructed from trusted internal values, not user input
    const cmd = `npx wrangler d1 execute DB --remote --env ${env} --command "${sql}" --json`;
    try {
        const result = execSync(cmd, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 100 * 1024 * 1024,
            cwd: process.cwd(),
        });
        const data = JSON.parse(result);
        return data[0]?.results || [];
    } catch (error) {
        console.error(
            "❌ D1 query failed:",
            error instanceof Error ? error.message : String(error),
        );
        return [];
    }
}

function executeD1(env: Environment, sql: string): boolean {
    // Safe: sql is constructed from trusted internal values, not user input
    const cmd = `npx wrangler d1 execute DB --remote --env ${env} --command "${sql}" --json`;
    try {
        execSync(cmd, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 10 * 1024 * 1024,
            cwd: process.cwd(),
        });
        return true;
    } catch {
        return false;
    }
}

function queryCount(env: Environment, sql: string): number {
    const results = queryD1(env, sql);
    const count = results[0]?.count;
    return typeof count === "number"
        ? count
        : typeof count === "string"
          ? Number(count)
          : 0;
}

function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function extractDeletedGithubUsers(results: ValidationResult[]): string[] {
    const usernames: string[] = [];
    for (const result of results) {
        const username = result?.username;
        if (typeof username !== "string") continue;
        if (!GITHUB_USERNAME_RE.test(username)) {
            usernames.push(username);
            continue;
        }
        if (result?.status === GITHUB_ACCOUNT_DELETED_REASON) {
            usernames.push(username);
        }
    }
    return Array.from(new Set(usernames));
}

function banGithubUsers(env: Environment, usernames: string[]): number {
    if (usernames.length === 0) return 0;

    const usernameList = usernames
        .map((username) => `'${escapeSqlString(username)}'`)
        .join(", ");
    const ok = executeD1(
        env,
        `UPDATE user SET banned = 1, ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}' WHERE github_username IN (${usernameList})`,
    );
    return ok ? usernames.length : 0;
}

/**
 * Phase 1: Microbe → Spore
 * Promote all microbe users who passed the abuse check (trust_score >= 60)
 */
function promoteMicrobeToSpore(env: Environment, dryRun: boolean): number {
    console.log("\n🔄 Phase 1: Microbe → Spore");

    // Find eligible users
    const eligible = queryD1(
        env,
        "SELECT email, github_username FROM user WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0",
    );

    if (eligible.length === 0) {
        console.log("   ✅ No microbe users eligible for promotion");
        return 0;
    }

    console.log(`   📊 ${eligible.length} users eligible for promotion`);

    if (dryRun) {
        for (const u of eligible.slice(0, 10)) {
            console.log(`   📝 Would promote: ${u.email}`);
        }
        if (eligible.length > 10)
            console.log(`   ... and ${eligible.length - 10} more`);
        return eligible.length;
    }

    // Batch promote — set tier_balance so they can use API immediately
    const ok = executeD1(
        env,
        "UPDATE user SET tier = 'spore', tier_balance = 0.01 WHERE tier = 'microbe' AND trust_score >= 60 AND COALESCE(banned, 0) = 0",
    );

    if (ok) {
        console.log(`   ✅ Promoted ${eligible.length} users to spore`);
    } else {
        console.error("   ❌ Failed to promote users");
    }

    return eligible.length;
}

/**
 * Phase 2: Spore → Seed (for just-promoted users with GitHub accounts)
 * Calls score_users.py for GitHub scoring
 */
function checkSporeForSeed(
    env: Environment,
    dryRun: boolean,
    allowBacklog: boolean,
    backlogThreshold: number,
): { upgraded: number; checked: number } {
    console.log("\n🔄 Phase 2: Spore → Seed (just-promoted users)");

    const backlogCount = queryCount(
        env,
        "SELECT COUNT(*) AS count FROM user WHERE tier = 'spore' AND github_username IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL",
    );

    if (backlogCount === 0) {
        console.log("   ✅ No new spore users with GitHub to check");
        return { upgraded: 0, checked: 0 };
    }

    if (backlogCount > backlogThreshold && !allowBacklog) {
        throw new Error(
            `Refusing to process ${backlogCount} scoreless spore users in the steady-state pipeline. Run scripts/user-pipeline/backfills/backfill_spore_scores.py first, or pass --allow-backlog to override.`,
        );
    }

    // Find spore users with GitHub who haven't been scored yet (score IS NULL)
    const sporeUsers = queryD1(
        env,
        "SELECT github_username FROM user WHERE tier = 'spore' AND github_username IS NOT NULL AND COALESCE(banned, 0) = 0 AND score IS NULL",
    );

    const usernames = sporeUsers
        .map((u) =>
            typeof u.github_username === "string" ? u.github_username : null,
        )
        .filter((username): username is string => Boolean(username));
    console.log(`   📊 ${usernames.length} spore users with GitHub to check`);

    if (dryRun) {
        for (const u of usernames.slice(0, 10)) {
            console.log(`   📝 Would check: ${u}`);
        }
        if (usernames.length > 10)
            console.log(`   ... and ${usernames.length - 10} more`);
        return { upgraded: 0, checked: usernames.length };
    }

    // Call the Python GitHub validation script
    try {
        const scriptPath = `${import.meta.dirname}/../github`;

        // Use the Python script's validate_users function via a wrapper
        const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptPath}")
from score_users import validate_users
results = validate_users(${JSON.stringify(usernames)})
print(json.dumps(results))
`;
        const output = execSync(
            `python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`,
            { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );

        const results = JSON.parse(output.trim()) as ValidationResult[];
        const now = Date.now(); // milliseconds to match D1 timestamp columns
        let upgraded = 0;
        const deletedUsernames = extractDeletedGithubUsers(results);
        const deletedUsernameSet = new Set(deletedUsernames);

        if (deletedUsernames.length > 0) {
            const banned = banGithubUsers(env, deletedUsernames);
            console.log(
                `   🚫 Banned ${banned} users with deleted/invalid GitHub accounts`,
            );
        }

        for (const result of results) {
            const username = result.username;
            if (
                typeof username !== "string" ||
                deletedUsernameSet.has(username)
            ) {
                continue;
            }
            const rawScore = Number(result.details?.total ?? 0);
            const totalScore = Number.isFinite(rawScore) ? rawScore : 0;
            const safeUsername = escapeSqlString(username);

            // Store score and score_checked_at for all checked users
            executeD1(
                env,
                `UPDATE user SET score = ${totalScore}, score_checked_at = ${now} WHERE github_username = '${safeUsername}'`,
            );

            // Upgrade to seed if approved (>= 8 pts)
            if (result.approved) {
                const ok = executeD1(
                    env,
                    `UPDATE user SET tier = 'seed', tier_balance = 0.15 WHERE github_username = '${safeUsername}' AND tier = 'spore'`,
                );
                if (ok) upgraded++;
            }
        }

        console.log(
            `   ✅ Checked ${results.length} users: ${upgraded} upgraded to seed`,
        );
        return { upgraded, checked: results.length };
    } catch (error) {
        console.error(
            "   ❌ GitHub validation failed:",
            error instanceof Error ? error.message : String(error),
        );
        return { upgraded: 0, checked: 0 };
    }
}

async function main(): Promise<void> {
    const config = parseArguments();

    console.log("🚀 Hourly New-User Pipeline: Microbe → Spore → Seed");
    console.log("=".repeat(50));
    console.log(`📋 Environment: ${config.env}`);
    if (config.dryRun) console.log("🔍 Mode: DRY RUN");
    if (config.allowBacklog) {
        console.log(
            `⚠️  Backlog override enabled (threshold=${config.backlogThreshold})`,
        );
    }

    const promoted = promoteMicrobeToSpore(config.env, config.dryRun);

    const { upgraded, checked } = checkSporeForSeed(
        config.env,
        config.dryRun,
        config.allowBacklog,
        config.backlogThreshold,
    );

    console.log(`\n${"=".repeat(50)}`);
    console.log("📊 Summary:");
    console.log(`   Microbe → Spore: ${promoted}`);
    console.log(`   Spore → Seed: ${upgraded} (of ${checked} checked)`);
}

main().catch(console.error);
