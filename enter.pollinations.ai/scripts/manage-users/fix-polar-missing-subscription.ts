#!/usr/bin/env npx tsx
/**
 * Fix polar-subscription-missing issues
 *
 * Creates Polar subscriptions for D1 users who have tiers but no Polar subscription.
 *
 * Usage:
 *   npx tsx scripts/manage-users/fix-polar-missing-subscription.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *
 * Input:
 *   scripts/manage-users/data/polar-subscription-missing.json (run compare-d1-polar-users.ts first)
 *
 * Actions:
 *   - For each user with "polar-subscription-missing" issue:
 *     1. Check if customer exists in Polar
 *     2. If customer exists, create subscription with D1 tier
 *     3. If customer doesn't exist, skip (needs manual investigation)
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 */

import { Polar } from "@polar-sh/sdk";
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "readline";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

function tierProductSlug(tier: string): string {
    return `v1:product:tier:${tier}`;
}

// Polar client
function createPolarClient(): Polar {
    const token = process.env.POLAR_ACCESS_TOKEN;
    if (!token) {
        throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
    }
    return new Polar({ accessToken: token, server: "production" });
}

// Helpers
function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 10,
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("429") && attempt < maxRetries) {
                const delay = Math.min(attempt * 20000, 120000);
                console.log(
                    `  Rate limited (${label}), attempt ${attempt}/${maxRetries}, waiting ${delay / 1000}s...`,
                );
                await sleep(delay);
                continue;
            }
            if (attempt < maxRetries) {
                const delay = 5000;
                console.log(
                    `  Error (${label}), attempt ${attempt}/${maxRetries}, retrying in ${delay / 1000}s...`,
                );
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Max retries exceeded for ${label}`);
}

function promptUser(question: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim());
        });
    });
}

// Data types
interface PolarIssue {
    type: string;
    email: string;
    d1: {
        id: string;
        tier: TierName;
        name: string;
        github_username: string | null;
        github_id: number | null;
        created_at: number;
    };
    polar: {
        tier: TierName | null;
        customerId: string | null;
        subscriptionId: string | null;
    };
}

interface IssueFile {
    overview: {
        comparedAt: string;
        polarDataFetchedAt: string;
        totalCount: number;
        description: string;
    };
    users: PolarIssue[];
}

type ProductMap = Map<string, { id: string; name: string }>;

const DATA_PATH = new URL(
    "./data/polar-subscription-missing.json",
    import.meta.url,
).pathname;

// Check for dry run mode
const DRY_RUN = process.argv.includes("--dry-run");

async function getTierProductMap(polar: Polar): Promise<ProductMap> {
    const products = await polar.products.list({ limit: 100 });
    const map = new Map<string, { id: string; name: string }>();
    for (const product of products.result.items) {
        const slug = product.metadata?.slug as string;
        if (slug?.startsWith("v1:product:tier:")) {
            map.set(slug, { id: product.id, name: product.name });
        }
    }
    return map;
}

async function getD1UserId(email: string): Promise<string | null> {
    try {
        const env = { ...process.env };
        delete env.CLOUDFLARE_API_TOKEN;
        const { stdout } = await execAsync(
            `npx wrangler d1 execute DB --remote --env production --command "SELECT id FROM user WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1" --json`,
            { env },
        );
        const result = JSON.parse(stdout);
        const userId = result[0]?.results?.[0]?.id;
        return userId || null;
    } catch (error: unknown) {
        console.log(
            `  ⚠️  Could not query D1: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    }
}

async function findCustomerByEmail(
    polar: Polar,
    email: string,
): Promise<string | null> {
    try {
        const response = await withRetry(
            () => polar.customers.list({ query: email, limit: 10 }),
            `find customer ${email}`,
        );

        for (const customer of response.result.items) {
            if (customer.email?.toLowerCase() === email.toLowerCase()) {
                return customer.id;
            }
        }
        return null;
    } catch (error: unknown) {
        console.log(
            `  ⚠️  Could not search for customer: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    }
}

async function hasActiveSubscription(
    polar: Polar,
    customerId: string,
): Promise<boolean | "error"> {
    try {
        const response = await withRetry(
            () =>
                polar.subscriptions.list({
                    customerId,
                    active: true,
                    limit: 10,
                }),
            `check subscriptions for customer`,
        );
        return response.result.items.length > 0;
    } catch (error: unknown) {
        console.log(
            `  ⚠️  Could not check subscriptions: ${error instanceof Error ? error.message : String(error)}`,
        );
        return "error";
    }
}

async function main() {
    console.log("=".repeat(60));
    if (DRY_RUN) {
        console.log("  CREATE MISSING POLAR SUBSCRIPTIONS (DRY RUN)");
    } else {
        console.log("  CREATE MISSING POLAR SUBSCRIPTIONS");
    }
    console.log("=".repeat(60));

    // Load issues file
    if (!existsSync(DATA_PATH)) {
        console.error(`\n❌ Issue file not found: ${DATA_PATH}`);
        console.error("   Run compare-d1-polar-users.ts first!");
        process.exit(1);
    }

    const data: IssueFile = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    console.log(`\nLoaded issues from: ${DATA_PATH}`);
    console.log(`  Compared at: ${data.overview.comparedAt}`);
    console.log(`  Polar data from: ${data.overview.polarDataFetchedAt}`);

    const missingInPolar = data.users;

    console.log(`\n📊 Summary:`);
    console.log(`   Users missing in Polar: ${missingInPolar.length}`);

    if (missingInPolar.length === 0) {
        console.log("\n✅ No missing subscriptions to create!");
        return;
    }

    // Show sample
    console.log("\n" + "-".repeat(60));
    console.log("SAMPLE OF USERS TO CREATE SUBSCRIPTIONS FOR:");
    console.log("-".repeat(60));
    for (const m of missingInPolar.slice(0, 10)) {
        console.log(`  ➕ ${m.email}: D1 tier = ${m.d1.tier}`);
    }
    if (missingInPolar.length > 10) {
        console.log(`  ... and ${missingInPolar.length - 10} more`);
    }

    if (DRY_RUN) {
        console.log("\n🧪 DRY RUN MODE - No changes will be made");
        console.log("   Remove --dry-run to execute changes");
        return;
    }

    console.log("\n⚠️  WARNING: This will create subscriptions in Polar!");
    console.log(
        "   Make sure you understand what this does before proceeding.",
    );

    const mode = await promptUser(
        `\nHow do you want to proceed?\n  [a] Create all subscriptions automatically\n  [i] Interactive (confirm each)\n  [n] Cancel\nChoice: `,
    );

    if (mode === "n" || mode === "") {
        console.log("Cancelled.");
        return;
    }

    // Initialize Polar
    const polar = createPolarClient();
    const productMap = await getTierProductMap(polar);

    let created = 0;
    let skipped = 0;
    let errors = 0;
    let noCustomer = 0;
    let alreadyHasSubscription = 0;

    for (let i = 0; i < missingInPolar.length; i++) {
        const m = missingInPolar[i];

        if (mode === "i") {
            console.log(`\n[${i + 1}/${missingInPolar.length}] ${m.email}`);
            console.log(`  D1 tier: ${m.d1.tier}`);
            const confirm = await promptUser(
                `  Create subscription? (y/n/q): `,
            );
            if (confirm === "q") {
                console.log("Quitting...");
                break;
            }
            if (confirm !== "y") {
                skipped++;
                continue;
            }
        }

        // Get product for target tier
        const slug = tierProductSlug(m.d1.tier);
        const product = productMap.get(slug);

        if (!product) {
            console.log(`  ❌ No product found for tier ${m.d1.tier}`);
            errors++;
            continue;
        }

        // Get D1 user ID
        const d1UserId = await getD1UserId(m.email);
        if (!d1UserId) {
            console.log(
                `  ⚠️  Could not find D1 user ID for ${m.email} (skipped)`,
            );
            errors++;
            continue;
        }

        // Find customer in Polar
        const customerId = await findCustomerByEmail(polar, m.email);

        if (!customerId) {
            if (mode === "a") {
                console.log(
                    `  ⏭️  [${i + 1}/${missingInPolar.length}] ${m.email}: No Polar customer found (skipped)`,
                );
            } else {
                console.log(`  ⏭️  No Polar customer found (skipped)`);
            }
            noCustomer++;
            continue;
        }

        // Check if customer already has an active subscription (data might be outdated)
        // FAIL-SAFE: If we can't verify, skip this user to avoid duplicates
        const hasExisting = await hasActiveSubscription(polar, customerId);
        if (hasExisting === "error") {
            if (mode === "a") {
                console.log(
                    `  ⏭️  [${i + 1}/${missingInPolar.length}] ${m.email}: Could not verify subscription status (skipped for safety)`,
                );
            } else {
                console.log(
                    `  ⏭️  Could not verify subscription status (skipped for safety)`,
                );
            }
            errors++;
            continue;
        }
        if (hasExisting === true) {
            if (mode === "a") {
                console.log(
                    `  ⏭️  [${i + 1}/${missingInPolar.length}] ${m.email}: Already has active subscription (skipped)`,
                );
            } else {
                console.log(`  ⏭️  Already has active subscription (skipped)`);
            }
            alreadyHasSubscription++;
            continue;
        }

        try {
            // Update customer external ID to link to D1
            await withRetry(
                () =>
                    polar.customers.update({
                        id: customerId,
                        customerUpdate: {
                            externalId: d1UserId,
                        },
                    }),
                `update external ID for ${m.email}`,
            );

            // Create subscription
            await withRetry(
                () =>
                    polar.subscriptions.create({
                        customerId,
                        productId: product.id,
                    }),
                `create subscription for ${m.email}`,
            );

            if (mode === "a") {
                console.log(
                    `  ✅ [${i + 1}/${missingInPolar.length}] ${m.email}: Created ${m.d1.tier} subscription`,
                );
            } else {
                console.log(`  ✅ Created ${m.d1.tier} subscription`);
            }
            created++;
            await sleep(2000); // Rate limit protection
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`  ❌ Error: ${msg}`);
            errors++;
        }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("DONE:");
    console.log(`  Created: ${created}`);
    console.log(
        `  Skipped (already has subscription): ${alreadyHasSubscription}`,
    );
    console.log(`  Skipped (no customer): ${noCustomer}`);
    console.log(`  Skipped (user choice): ${skipped}`);
    console.log(`  Errors: ${errors}`);

    if (noCustomer > 0) {
        console.log(
            `\n⚠️  ${noCustomer} users don't have Polar customer accounts.`,
        );
        console.log(
            `   These users may have registered in D1 but never visited Polar.`,
        );
        console.log(`   Consider investigating these cases manually.`);
    }

    if (created > 0) {
        console.log("\n⚠️  Remember to re-fetch Polar data to verify changes:");
        console.log("   npx tsx scripts/manage-users/fetch-polar-data.ts");
        console.log(
            "   npx tsx scripts/manage-users/compare-d1-polar-users.ts",
        );
    }
}

main().catch(console.error);
