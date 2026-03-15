#!/usr/bin/env npx tsx
/**
 * Upgrade Pipeline: Microbe → Spore → Seed
 *
 * Phase 1: Promote microbe users who passed abuse check (trust_score >= 60) to spore
 * Phase 2: Check GitHub profiles for just-upgraded spore users → seed if eligible
 *
 * USAGE:
 *   cd enter.pollinations.ai
 *   npx tsx scripts/upgrade-microbe-to-spore.ts                    # Production
 *   npx tsx scripts/upgrade-microbe-to-spore.ts --env staging      # Staging
 *   npx tsx scripts/upgrade-microbe-to-spore.ts --dry-run          # Preview only
 */

import { execSync } from "node:child_process";

interface ParsedArgs {
    env: "staging" | "production";
    dryRun: boolean;
}

function parseArguments(): ParsedArgs {
    const args = process.argv.slice(2);
    const envIndex = args.indexOf("--env");
    const env =
        envIndex >= 0 && args[envIndex + 1]
            ? (args[envIndex + 1] as "staging" | "production")
            : "production";
    return {
        env,
        dryRun: args.includes("--dry-run"),
    };
}

function queryD1(env: string, sql: string): any[] {
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

function executeD1(env: string, sql: string): boolean {
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

/**
 * Phase 1: Microbe → Spore
 * Promote all microbe users who passed the abuse check (trust_score >= 60)
 */
function promoteMicrobeToSpore(env: string, dryRun: boolean): number {
    console.log("\n🔄 Phase 1: Microbe → Spore");

    // Find eligible users
    const eligible = queryD1(
        env,
        "SELECT email, github_username FROM user WHERE tier = 'microbe' AND trust_score >= 60",
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
        "UPDATE user SET tier = 'spore', tier_balance = 0.01 WHERE tier = 'microbe' AND trust_score >= 60",
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
 * Calls user_validate_github_profile.py for GitHub scoring
 */
function checkSporeForSeed(
    env: string,
    dryRun: boolean,
): { upgraded: number; checked: number } {
    console.log("\n🔄 Phase 2: Spore → Seed (just-promoted users)");

    // Find spore users with GitHub who haven't been scored yet (score IS NULL)
    const sporeUsers = queryD1(
        env,
        "SELECT github_username FROM user WHERE tier = 'spore' AND github_username IS NOT NULL AND score IS NULL",
    );

    if (sporeUsers.length === 0) {
        console.log("   ✅ No new spore users with GitHub to check");
        return { upgraded: 0, checked: 0 };
    }

    const usernames = sporeUsers
        .map((u: any) => u.github_username)
        .filter(Boolean);
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
        const scriptPath = `${process.cwd()}/../.github/scripts`;

        // Use the Python script's validate_users function via a wrapper
        const pythonScript = `
import sys, json
sys.path.insert(0, "${scriptPath}")
from user_validate_github_profile import validate_users
results = validate_users(${JSON.stringify(usernames)})
print(json.dumps(results))
`;
        const output = execSync(
            `python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`,
            { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
        );

        const results = JSON.parse(output.trim());
        const now = Math.floor(Date.now() / 1000);
        let upgraded = 0;

        for (const result of results) {
            const username = result.username;
            const totalScore = result.details?.total ?? 0;
            const safeUsername = username.replace(/'/g, "''");

            // Store score and score_checked_at for all checked users
            executeD1(
                env,
                `UPDATE user SET score = ${totalScore}, score_checked_at = ${now} WHERE github_username = '${safeUsername}'`,
            );

            // Upgrade to seed if approved (>= 8 pts, no fraud)
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

    console.log("🚀 Upgrade Pipeline: Microbe → Spore → Seed");
    console.log("=".repeat(50));
    console.log(`📋 Environment: ${config.env}`);
    if (config.dryRun) console.log("🔍 Mode: DRY RUN");

    const promoted = promoteMicrobeToSpore(config.env, config.dryRun);

    const { upgraded, checked } = checkSporeForSeed(config.env, config.dryRun);

    console.log("\n" + "=".repeat(50));
    console.log("📊 Summary:");
    console.log(`   Microbe → Spore: ${promoted}`);
    console.log(`   Spore → Seed: ${upgraded} (of ${checked} checked)`);
}

main().catch(console.error);
