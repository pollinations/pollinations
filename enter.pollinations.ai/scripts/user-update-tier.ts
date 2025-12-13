/**
 * User Tier Update Script
 *
 * Updates a user's tier in both the D1 database AND Polar subscription.
 * Used by GitHub Actions when app submissions are approved.
 *
 * Usage:
 *   npx tsx scripts/user-update-tier.ts update-tier --github-username "john" --tier flower --env production
 *   npx tsx scripts/user-update-tier.ts check-user --github-username "john" --env production
 *
 * Environment variables:
 *   POLAR_ACCESS_TOKEN - Required for Polar subscription updates
 */

import { command, run, string, boolean } from "@drizzle-team/brocli";
import { execSync } from "node:child_process";

type TierName = "spore" | "seed" | "flower" | "nectar" | "router";
type Environment = "staging" | "production";

// Tier hierarchy for comparison (higher index = higher tier)
const TIER_HIERARCHY: TierName[] = [
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

function updateD1Tier(
    env: Environment,
    githubUsername: string,
    tier: TierName,
): boolean {
    const safeUsername = sanitizeGitHubUsername(githubUsername);
    const sql = `UPDATE user SET tier = '${tier}' WHERE LOWER(github_username) = LOWER('${safeUsername}');`;
    try {
        queryD1(env, sql);
        return true;
    } catch {
        return false;
    }
}

/**
 * Update or create Polar subscription for a user.
 * Calls the existing manage-polar.ts script to avoid code duplication.
 * Returns true if successful or skipped (no token), false on error.
 */
// Email validation: standard email format, no shell metacharacters
function sanitizeEmail(email: string): string {
    // Only allow standard email characters
    const sanitized = email.replace(/[^a-zA-Z0-9.@_+-]/g, "");
    if (sanitized !== email) {
        console.warn(`⚠️  Sanitized email: "${email}" → "${sanitized}"`);
    }
    if (!sanitized.includes("@") || sanitized.length > 254) {
        throw new Error(`Invalid email format: "${email}"`);
    }
    return sanitized;
}

function updatePolarSubscription(
    env: Environment,
    email: string,
    tier: TierName,
): boolean {
    if (!process.env.POLAR_ACCESS_TOKEN) {
        console.warn("⚠️  POLAR_ACCESS_TOKEN not set - skipping Polar update");
        return true; // Not an error, just skipped
    }

    const safeEmail = sanitizeEmail(email);
    const cmd = `npx tsx scripts/manage-polar.ts user update-tier --email "${safeEmail}" --tier ${tier} --env ${env}`;
    try {
        execSync(cmd, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "inherit", "inherit"], // Show output
        });
        return true;
    } catch {
        // manage-polar.ts exits with 1 if no subscription found - that's expected for new users
        return false;
    }
}

const updateTierCommand = command({
    name: "update-tier",
    desc: "Update a user's tier in the D1 database",
    options: {
        githubUsername: string().required().desc("GitHub username of the user"),
        tier: string()
            .enum("spore", "seed", "flower", "nectar", "router")
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
            if (currentTier === targetTier) {
                console.log(
                    `\n✅ Already on ${targetTier} tier - no changes needed`,
                );
                return;
            }

            const currentRank = getTierRank(currentTier);
            const targetRank = getTierRank(targetTier);

            if (targetRank > currentRank) {
                console.log(`\n⬆️  Upgrading: ${currentTier} → ${targetTier}`);
            } else {
                console.log(`\n⬇️  Downgrading: ${currentTier} → ${targetTier}`);
            }
        }

        // Step 2: Update D1 tier
        if (!opts.dryRun) {
            console.log(`\n📝 Updating D1 tier to '${targetTier}'...`);
            const dbUpdated = updateD1Tier(
                env,
                opts.githubUsername,
                targetTier,
            );
            if (!dbUpdated) {
                console.error(`❌ Failed to update D1 database`);
                process.exit(1);
            }
            console.log(`✅ D1 tier updated`);

            // Step 3: Update Polar subscription (if token available)
            console.log(`\n🌸 Updating Polar subscription...`);
            const polarUpdated = updatePolarSubscription(
                env,
                user.email,
                targetTier,
            );
            if (!polarUpdated) {
                // Not fatal - user may not have a Polar subscription yet
                console.warn(
                    `⚠️  Polar update failed (user may need to activate at enter.pollinations.ai)`,
                );
            }
        } else {
            console.log(`\n📝 Would update D1 tier to '${targetTier}'`);
            console.log(
                `📝 Would update Polar subscription to '${targetTier}'`,
            );
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

run([updateTierCommand, checkUserCommand]);
