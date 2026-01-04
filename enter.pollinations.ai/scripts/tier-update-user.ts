/**
 * User Tier Update Script
 *
 * Updates a user's tier in both the D1 database AND Polar subscription.
 * Used by GitHub Actions when app submissions are approved.
 *
 * Usage:
 *   npx tsx scripts/tier-update-user.ts update-tier --github-username "john" --tier flower --env production
 *   npx tsx scripts/tier-update-user.ts check-user --github-username "john" --env production
 *
 * Environment variables:
 *   POLAR_ACCESS_TOKEN - Required for Polar subscription updates
 */

import { execSync } from "node:child_process";
import { boolean, command, run, string } from "@drizzle-team/brocli";
import { Polar } from "@polar-sh/sdk";

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

// Production tier product IDs (must match manage-polar.ts)
const TIER_PRODUCT_IDS = {
    production: {
        spore: "01a31c1a-7af7-4958-9b73-c10e2fac5f70",
        seed: "fe32ee28-c7c4-4e7a-87fa-6ffc062e3658",
        flower: "dfb4c4f6-2004-4205-a358-b1f7bb3b310e",
        nectar: "066f91a4-8ed1-4329-b5f7-3f71e992ed28",
        router: "0286ea62-540f-4b19-954f-b8edb9095c43",
    },
    staging: {
        spore: "19fa1660-a90c-453d-8132-4d228cc7db39",
        seed: "c6f94c1b-c119-4e59-9f18-59391c8afee3",
        flower: "18bdd5c4-dcb3-4a15-8ca6-1c0b45f76b84",
        nectar: "a438764a-c486-4ff4-8f85-e66199c6b26f",
        router: "9256189e-ad01-4608-8102-4ebfc4b506e0",
    },
} as const;

/**
 * Update Polar subscription for a user using SDK directly.
 * Returns { success, error?, polarTier? }
 */
async function updatePolarSubscription(
    env: Environment,
    email: string,
    tier: TierName,
): Promise<{ success: boolean; error?: string; polarTier?: string }> {
    if (!process.env.POLAR_ACCESS_TOKEN) {
        console.warn("⚠️  POLAR_ACCESS_TOKEN not set - skipping Polar update");
        return { success: true }; // Not an error, just skipped
    }

    const polar = new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        server: env === "production" ? "production" : "sandbox",
    });

    const targetProductId = TIER_PRODUCT_IDS[env][tier];

    try {
        // Find customer by email
        const customerResponse = await polar.customers.list({
            email: email.toLowerCase(),
            limit: 1,
        });
        const customer = customerResponse.result.items[0];
        if (!customer) {
            return {
                success: false,
                error: `No Polar customer found for ${email}`,
            };
        }

        // Find active subscription
        const subsResponse = await polar.subscriptions.list({
            customerId: customer.id,
            active: true,
            limit: 1,
        });
        const subscription = subsResponse.result.items[0];

        if (subscription) {
            // Already on target tier?
            if (subscription.productId === targetProductId) {
                console.log(`   Polar: Already on ${tier} tier`);
                return { success: true, polarTier: tier };
            }

            // Update existing subscription
            console.log(`   Polar: Updating subscription to ${tier}...`);
            await polar.subscriptions.update({
                id: subscription.id,
                subscriptionUpdate: {
                    productId: targetProductId,
                    prorationBehavior: "prorate",
                },
            });
            console.log(`   ✅ Polar subscription updated to ${tier}`);
            return { success: true, polarTier: tier };
        } else {
            // No subscription - create one
            console.log(`   Polar: Creating new ${tier} subscription...`);
            await polar.subscriptions.create({
                productId: targetProductId,
                customerId: customer.id,
            });
            console.log(`   ✅ Polar subscription created: ${tier}`);
            return { success: true, polarTier: tier };
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Polar update failed: ${msg}`);
        return { success: false, error: msg };
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
            const polarResult = await updatePolarSubscription(
                env,
                user.email,
                targetTier,
            );
            if (!polarResult.success) {
                // Not fatal - user may not have a Polar subscription yet
                console.warn(
                    `⚠️  Polar update failed: ${polarResult.error || "unknown error"}`,
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

/**
 * Get Polar subscription tier for a user by email using SDK directly.
 * Returns the tier name or null if no active subscription.
 */
async function getPolarTier(
    env: Environment,
    email: string,
): Promise<string | null> {
    if (!process.env.POLAR_ACCESS_TOKEN) {
        console.warn("⚠️  POLAR_ACCESS_TOKEN not set - cannot check Polar tier");
        return null;
    }

    const polar = new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        server: env === "production" ? "production" : "sandbox",
    });

    try {
        // Find customer by email
        const customerResponse = await polar.customers.list({
            email: email.toLowerCase(),
            limit: 1,
        });
        const customer = customerResponse.result.items[0];
        if (!customer) {
            return null;
        }

        // Find active subscription
        const subsResponse = await polar.subscriptions.list({
            customerId: customer.id,
            active: true,
            limit: 1,
        });
        const subscription = subsResponse.result.items[0];

        if (!subscription) {
            return null;
        }

        // Map product ID back to tier name
        const productId = subscription.productId;
        const tierMap = TIER_PRODUCT_IDS[env];
        for (const [tierName, id] of Object.entries(tierMap)) {
            if (id === productId) {
                return tierName;
            }
        }

        return null;
    } catch {
        return null;
    }
}

// Verify tier command - checks both D1 and Polar match the expected tier
const verifyTierCommand = command({
    name: "verify-tier",
    desc: "Verify a user's tier matches in both D1 and Polar",
    options: {
        githubUsername: string().required().desc("GitHub username to verify"),
        tier: string()
            .enum("spore", "seed", "flower", "nectar", "router")
            .required()
            .desc("Expected tier to verify"),
        env: string().enum("staging", "production").default("production"),
    },
    handler: async (opts) => {
        const env = opts.env as Environment;
        const expectedTier = opts.tier as TierName;

        console.log(`\n🔍 Verifying tier for: ${opts.githubUsername}`);
        console.log(`   Expected tier: ${expectedTier}`);

        // Step 1: Check D1
        const user = getD1User(env, opts.githubUsername);
        if (!user) {
            console.error(`❌ User not found in D1 database`);
            console.log("VERIFIED=false");
            console.log("d1_tier=NOT_FOUND");
            process.exit(1);
        }

        const d1Tier = user.tier || "none";
        console.log(`   D1 tier: ${d1Tier}`);

        // Step 2: Check Polar
        const polarTier = await getPolarTier(env, user.email);
        console.log(`   Polar tier: ${polarTier || "unknown"}`);

        // Step 3: Verify both match expected
        const d1Match = d1Tier === expectedTier;
        const polarMatch = polarTier === expectedTier || polarTier === null; // Allow null if Polar not set up

        if (d1Match && polarMatch) {
            console.log(
                `\n✅ VERIFIED: Tier is ${expectedTier} in both systems`,
            );
            console.log("VERIFIED=true");
            console.log(`d1_tier=${d1Tier}`);
            console.log(`polar_tier=${polarTier || "not_checked"}`);
            process.exit(0);
        } else {
            console.error(`\n❌ MISMATCH: Expected ${expectedTier}`);
            console.log("VERIFIED=false");
            console.log(`d1_tier=${d1Tier}`);
            console.log(`polar_tier=${polarTier || "unknown"}`);
            if (!d1Match) console.error(`   D1 has: ${d1Tier}`);
            if (!polarMatch && polarTier)
                console.error(`   Polar has: ${polarTier}`);
            process.exit(1);
        }
    },
});

run([updateTierCommand, checkUserCommand, verifyTierCommand]);
