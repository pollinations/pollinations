/**
 * User Tier Update Script
 *
 * Updates a user's tier directly in D1 database.
 * Used by GitHub Actions when app submissions are approved or spore→seed upgrades.
 *
 * Usage:
 *   npx tsx scripts/tier-update-user.ts update-tier --github-username "john" --tier flower --env production
 *   npx tsx scripts/tier-update-user.ts check-user --github-username "john" --env production
 *   npx tsx scripts/tier-update-user.ts verify-tier --github-username "john" --tier flower --env production
 *
 * Environment variables:
 *   CLOUDFLARE_API_TOKEN - Required for D1 access via wrangler
 *   CLOUDFLARE_ACCOUNT_ID - Required for D1 access via wrangler
 */

import { execSync } from "node:child_process";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import {
    TIER_POLLEN as TIER_POLLEN_CONFIG,
    type TierName,
} from "../src/tier-config.ts";

type Environment = "staging" | "production";

// Tier hierarchy for comparison (higher index = higher tier)
const TIER_HIERARCHY: TierName[] = [
    "microbe",
    "spore",
    "seed",
    "flower",
    "nectar",
    "router",
];

function getTierRank(tier: TierName): number {
    return TIER_HIERARCHY.indexOf(tier);
}

interface D1User {
    id: string;
    github_username: string;
    email: string;
    tier: string | null;
}

// GitHub usernames: alphanumeric + hyphens, max 39 chars
// https://docs.github.com/en/rest/users#get-a-user
function sanitizeGitHubUsername(username: string): string {
    const sanitized = username.replace(/[^a-zA-Z0-9-]/g, "");
    if (sanitized !== username) {
        console.warn(`⚠️  Sanitized username: "${username}" → "${sanitized}"`);
    }
    if (sanitized.length === 0 || sanitized.length > 39) {
        throw new Error(`Invalid GitHub username: "${username}"`);
    }
    return sanitized;
}

function queryD1(env: Environment, sql: string): string {
    const envFlag = env === "production" ? "--env production" : "--env staging";
    const cmd = `npx wrangler d1 execute DB --remote ${envFlag} --command "${sql}" --json`;

    try {
        const result = execSync(cmd, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return result;
    } catch (error) {
        console.error(
            "D1 query failed:",
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}

function getD1User(env: Environment, githubUsername: string): D1User | null {
    const safeUsername = sanitizeGitHubUsername(githubUsername);
    const sql = `SELECT id, github_username, email, tier FROM user WHERE LOWER(github_username) = LOWER('${safeUsername}') LIMIT 1;`;
    const result = queryD1(env, sql);

    try {
        const parsed = JSON.parse(result);
        // Wrangler D1 returns results in an array
        const results = parsed[0]?.results || parsed.results || [];
        if (results.length === 0) {
            return null;
        }
        return results[0] as D1User;
    } catch {
        console.error("Failed to parse D1 response:", result);
        return null;
    }
}

// Use pollen amounts from central config
const TIER_POLLEN = TIER_POLLEN_CONFIG;

/**
 * Update tier directly in D1 database.
 * Also sets tier_balance to the new tier's pollen amount.
 */
function updateD1Tier(
    env: Environment,
    userId: string,
    tier: TierName,
): { success: boolean; error?: string } {
    const tierBalance = TIER_POLLEN[tier];
    const sql = `UPDATE user SET tier = '${tier}', tier_balance = ${tierBalance} WHERE id = '${userId}';`;

    try {
        queryD1(env, sql);
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}

const updateTierCommand = command({
    name: "update-tier",
    desc: "Update a user's tier in the D1 database",
    options: {
        githubUsername: string().required().desc("GitHub username of the user"),
        tier: string()
            .enum("microbe", "spore", "seed", "flower", "nectar", "router")
            .required()
            .desc("Target tier to assign"),
        env: string().enum("staging", "production").default("production"),
        dryRun: boolean()
            .default(false)
            .desc("Show what would be done without making changes"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const targetTier = opts.tier as TierName;

        console.log(`\n🔍 Looking up user: ${opts.githubUsername}`);
        console.log(`   Environment: ${env}`);
        console.log(`   Target tier: ${targetTier}`);
        if (opts.dryRun) {
            console.log(`   Mode: DRY RUN (no changes will be made)\n`);
        }

        // Step 1: Find user in D1
        const user = getD1User(env, opts.githubUsername);
        if (!user) {
            console.error(
                `❌ User not found in D1 database: ${opts.githubUsername}`,
            );
            console.log(`   User must sign up at enter.pollinations.ai first`);
            process.exit(1);
        }

        console.log(`✅ Found user in D1:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Current tier: ${user.tier || "none"}`);

        // Check tier hierarchy - only compare if current tier is valid
        const currentTier = user.tier;
        const isValidTier = (t: string | null): t is TierName =>
            t !== null && TIER_HIERARCHY.includes(t as TierName);

        if (isValidTier(currentTier)) {
            const currentRank = getTierRank(currentTier);
            const targetRank = getTierRank(targetTier);

            if (currentRank >= targetRank) {
                // User is already at or above target tier - skip silently
                console.log(
                    `\n✅ User already at ${currentTier} tier (>= ${targetTier}) - skipping`,
                );
                console.log(`SKIP_UPGRADE=true`);
                return;
            }

            console.log(`\n⬆️  Upgrading: ${currentTier} → ${targetTier}`);
        }

        // Update tier directly in D1
        if (!opts.dryRun) {
            console.log(`\n🌸 Updating D1 tier...`);
            const result = updateD1Tier(env, user.id, targetTier);
            if (!result.success) {
                console.error(
                    `❌ D1 update failed: ${result.error || "unknown error"}`,
                );
                process.exit(1);
            }
            console.log(`   ✅ D1 tier updated to ${targetTier}`);
        } else {
            console.log(`📝 Would update D1 tier to '${targetTier}'`);
        }

        console.log(`\n✅ Tier update complete!`);
    },
});

// Also export a simple check command for the GitHub workflow
const checkUserCommand = command({
    name: "check-user",
    desc: "Check if a GitHub user exists in the Enter database",
    options: {
        githubUsername: string().required().desc("GitHub username to check"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const user = getD1User(env, opts.githubUsername);

        if (user) {
            console.log("EXISTS");
            console.log(`user_id=${user.id}`);
            console.log(`email=${user.email}`);
            console.log(`tier=${user.tier || "none"}`);
            process.exit(0);
        } else {
            console.log("NOT_FOUND");
            process.exit(1);
        }
    },
});

// Verify tier command - checks D1 tier matches expected
const verifyTierCommand = command({
    name: "verify-tier",
    desc: "Verify a user's tier in D1 matches expected value",
    options: {
        githubUsername: string().required().desc("GitHub username to verify"),
        tier: string()
            .enum("microbe", "spore", "seed", "flower", "nectar", "router")
            .required()
            .desc("Expected tier to verify"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const expectedTier = opts.tier as TierName;

        console.log(`\n🔍 Verifying tier for: ${opts.githubUsername}`);
        console.log(`   Expected tier: ${expectedTier}`);

        // Check D1
        const user = getD1User(env, opts.githubUsername);
        if (!user) {
            console.error(`❌ User not found in D1 database`);
            console.log("VERIFIED=false");
            console.log("d1_tier=NOT_FOUND");
            process.exit(1);
        }

        const d1Tier = user.tier || "none";
        console.log(`   D1 tier: ${d1Tier}`);

        // Verify D1 matches expected
        const d1Match = d1Tier === expectedTier;

        if (d1Match) {
            console.log(`\n✅ VERIFIED: Tier is ${expectedTier}`);
            console.log("VERIFIED=true");
            console.log(`d1_tier=${d1Tier}`);
            process.exit(0);
        } else {
            console.error(
                `\n❌ MISMATCH: Expected ${expectedTier}, got ${d1Tier}`,
            );
            console.log("VERIFIED=false");
            console.log(`d1_tier=${d1Tier}`);
            process.exit(1);
        }
    },
});

run([updateTierCommand, checkUserCommand, verifyTierCommand]);
