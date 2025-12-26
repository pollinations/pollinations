#!/usr/bin/env npx tsx
/**
 * Sync tier mismatches between D1 and Polar.
 *
 * Usage:
 *   npx tsx scripts/sync-tier-mismatches.ts
 *
 * Flow:
 *   1. Detect tier mismatches (D1 tier ≠ Polar subscription tier)
 *   2. List them with emails
 *   3. For each, propose upgrade to higher tier (no downgrades allowed)
 *   4. Ask YES/NO for each change
 *
 * Tier order: spore(0) < seed(1) < flower(2) < nectar(3)
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 *   - wrangler configured for D1 access
 */

import { Polar } from "@polar-sh/sdk";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";

const execAsync = promisify(exec);

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

const TIER_ORDER: Record<TierName, number> = {
    spore: 0,
    seed: 1,
    flower: 2,
    nectar: 3,
};

function getTierRank(tier: TierName): number {
    return TIER_ORDER[tier];
}

function getHigherTier(tier1: TierName, tier2: TierName): TierName {
    return getTierRank(tier1) >= getTierRank(tier2) ? tier1 : tier2;
}

function tierProductSlug(tier: string): string {
    return `v1:product:tier:${tier}`;
}

function isValidTier(tier: string): tier is TierName {
    return TIERS.includes(tier as TierName);
}

// Polar client
function createPolarClient(): Polar {
    const token = process.env.POLAR_ACCESS_TOKEN;
    if (!token) {
        throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
    }
    return new Polar({ accessToken: token, server: "production" });
}

// D1 query
interface D1User {
    id: string;
    email: string;
    tier: string;
}

async function queryD1Users(): Promise<Map<string, D1User>> {
    console.log("  Querying D1 for all users...");
    const { stdout } = await execAsync(
        `npx wrangler d1 execute production-pollinations-enter-db --remote --command "SELECT id, email, tier FROM user" --json`,
    );
    const result = JSON.parse(stdout);
    const users = (result[0]?.results as D1User[]) || [];

    const userMap = new Map<string, D1User>();
    for (const user of users) {
        userMap.set(user.id, user);
        userMap.set(user.email.toLowerCase(), user);
    }
    console.log(`  Found ${users.length} users in D1`);
    return userMap;
}

// Product map
type ProductMap = Map<string, { id: string; name: string }>;

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

// Helpers
function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 5,
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("429") && attempt < maxRetries) {
                const delay = attempt * 3000;
                console.log(
                    `  Rate limited (${label}), waiting ${delay / 1000}s...`,
                );
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Max retries exceeded for ${label}`);
}

function promptUser(question: string): Promise<boolean> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(
                answer.toLowerCase() === "y" || answer.toLowerCase() === "yes",
            );
        });
    });
}

// Issue types
type IssueType = "mismatch" | "missing_polar";

interface TierIssue {
    polarId: string;
    email: string;
    d1Tier: TierName;
    polarTier: TierName | null; // null if no Polar subscription
    issueType: IssueType;
}

// Detect tier issues (mismatches + missing Polar subscriptions)
async function detectIssues(polar: Polar): Promise<TierIssue[]> {
    const issues: TierIssue[] = [];
    const d1Users = await queryD1Users();

    // Get subscriptions with tier
    console.log("  Fetching Polar subscriptions...");
    const customerTiers = new Map<string, TierName>();
    const subPaginator = await withRetry(
        () => polar.subscriptions.list({ active: true, limit: 100 }),
        "subscriptions.list",
    );
    for await (const page of subPaginator) {
        for (const sub of page.result.items) {
            const slug = (sub.product?.metadata?.slug as string) || "";
            const match = slug.match(/^v1:product:tier:(\w+)$/);
            if (match?.[1] && isValidTier(match[1])) {
                customerTiers.set(sub.customer.id, match[1]);
            }
        }
        await sleep(500);
    }
    console.log(
        `  Found ${customerTiers.size} customers with tier subscriptions`,
    );

    // Get customers and find mismatches
    console.log("  Fetching Polar customers...");
    await sleep(2000);
    let page = 1;
    let hasMore = true;
    let total = 0;

    while (hasMore) {
        const response = await withRetry(
            () => polar.customers.list({ limit: 100, page }),
            `customers.list page ${page}`,
        );
        const items = response.result.items;
        if (items.length === 0) break;

        for (const customer of items) {
            total++;
            if (customer.deletedAt) continue;

            const polarTier = customerTiers.get(customer.id) || null;

            // Find D1 user
            let d1User: D1User | undefined;
            if (customer.externalId) d1User = d1Users.get(customer.externalId);
            if (!d1User) d1User = d1Users.get(customer.email.toLowerCase());

            const d1Tier =
                d1User && isValidTier(d1User.tier) ? d1User.tier : null;
            if (!d1Tier) continue; // No D1 tier, skip

            // Case 1: Has D1 tier but no Polar subscription
            if (!polarTier) {
                issues.push({
                    polarId: customer.id,
                    email: customer.email,
                    d1Tier,
                    polarTier: null,
                    issueType: "missing_polar",
                });
                continue;
            }

            // Case 2: Both exist but mismatch
            if (d1Tier !== polarTier) {
                issues.push({
                    polarId: customer.id,
                    email: customer.email,
                    d1Tier,
                    polarTier,
                    issueType: "mismatch",
                });
            }
        }

        if (total % 500 === 0)
            console.log(`    Processed ${total} customers...`);
        hasMore = items.length === 100;
        page++;
        await sleep(1000);
    }

    console.log(`  Total customers: ${total}`);
    return issues;
}

// Main
async function main() {
    const polar = createPolarClient();

    console.log("=".repeat(60));
    console.log("  TIER SYNC - Interactive Mode");
    console.log("=".repeat(60));
    console.log("\nTier order: spore(0) < seed(1) < flower(2) < nectar(3)");
    console.log(
        "Rule: Users cannot downgrade, always upgrade to higher tier\n",
    );

    // Step 1: Detect
    console.log("Step 1: Detecting tier issues...\n");
    const issues = await detectIssues(polar);

    if (issues.length === 0) {
        console.log("✅ No tier issues found!");
        return;
    }

    // Separate by type
    const mismatches = issues.filter((i) => i.issueType === "mismatch");
    const missingPolar = issues.filter((i) => i.issueType === "missing_polar");

    // Step 2: List
    console.log(`\nStep 2: Found ${issues.length} tier issues:\n`);

    if (mismatches.length > 0) {
        console.log(`  🔄 Tier mismatches (D1 ≠ Polar): ${mismatches.length}`);
    }
    if (missingPolar.length > 0) {
        console.log(`  ➕ Missing Polar subscription: ${missingPolar.length}`);
    }

    console.log(
        "\n  #  | Type    | Email                          | D1 Tier  | Polar Tier | Action",
    );
    console.log(
        "  ---|---------|--------------------------------|----------|------------|--------",
    );

    for (let i = 0; i < issues.length; i++) {
        const m = issues[i];
        const typeIcon = m.issueType === "mismatch" ? "🔄" : "➕";
        const polarDisplay = m.polarTier || "(none)";
        const targetTier = m.polarTier
            ? getHigherTier(m.d1Tier, m.polarTier)
            : m.d1Tier;
        const action =
            m.issueType === "missing_polar"
                ? `→ Create Polar ${m.d1Tier}`
                : targetTier !== m.d1Tier
                  ? `→ Update D1 to ${targetTier}`
                  : `→ Update Polar to ${targetTier}`;
        console.log(
            `  ${String(i + 1).padStart(2)} | ${typeIcon}      | ${m.email.padEnd(30)} | ${m.d1Tier.padEnd(8)} | ${polarDisplay.padEnd(10)} | ${action}`,
        );
    }

    // Get products
    const productMap = await getTierProductMap(polar);

    // Step 3 & 4: Review each
    console.log("\n" + "=".repeat(60));
    console.log("Step 3 & 4: Review each issue and confirm\n");

    let d1Updates = 0;
    let polarUpdates = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < issues.length; i++) {
        const m = issues[i];
        const isMissing = m.issueType === "missing_polar";
        const targetTier = isMissing
            ? m.d1Tier
            : getHigherTier(m.d1Tier, m.polarTier!);
        const needsD1 = !isMissing && targetTier !== m.d1Tier;
        const needsPolar = isMissing || targetTier !== m.polarTier;

        const typeLabel = isMissing ? "➕ Missing Polar" : "🔄 Mismatch";
        console.log(`\n[${i + 1}/${issues.length}] ${m.email} (${typeLabel})`);
        console.log(
            `  Current: D1=${m.d1Tier}, Polar=${m.polarTier || "(none)"}`,
        );
        console.log(
            `  Proposed: ${isMissing ? `Create Polar subscription for ${targetTier}` : `Upgrade to ${targetTier}`}`,
        );
        if (needsD1) {
            console.log(`  Action: Update D1 ${m.d1Tier} → ${targetTier}`);
        }
        if (needsPolar) {
            console.log(
                `  Action: Create Polar subscription for ${targetTier}`,
            );
        }

        const confirm = await promptUser(`  Apply this change? (y/N): `);

        if (!confirm) {
            console.log(`  ⏭️  Skipped`);
            skipped++;
            continue;
        }

        try {
            if (needsD1) {
                await execAsync(
                    `npx wrangler d1 execute production-pollinations-enter-db --remote --command "UPDATE user SET tier = '${targetTier}' WHERE email = '${m.email}'"`,
                );
                console.log(`  ✅ Updated D1 to ${targetTier}`);
                d1Updates++;
            }

            if (needsPolar) {
                const slug = tierProductSlug(targetTier);
                const product = productMap.get(slug);
                if (product) {
                    await polar.subscriptions.create({
                        customerId: m.polarId,
                        productId: product.id,
                        metadata: { syncedBy: "sync-tier-mismatches" },
                    });
                    console.log(
                        `  ✅ Created Polar subscription for ${targetTier}`,
                    );
                    polarUpdates++;
                } else {
                    console.log(`  ❌ No product found for tier ${targetTier}`);
                    errors++;
                }
            }
            await sleep(500);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`  ❌ Error: ${msg}`);
            errors++;
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("SYNC COMPLETE:");
    console.log(`  D1 updates: ${d1Updates}`);
    console.log(`  Polar updates: ${polarUpdates}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
