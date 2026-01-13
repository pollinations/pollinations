#!/usr/bin/env npx tsx
/**
 * Fix polar-tier-mismatch issues
 *
 * Updates Polar subscriptions to match D1 tier.
 *
 * Usage:
 *   npx tsx scripts/manage-users/fix-polar-tier-mismatch.ts
 *
 * Input:
 *   scripts/manage-users/data/polar-tier-mismatch.json (run compare-d1-polar-users.ts first)
 *
 * Actions:
 *   - For each user with "polar-tier-mismatch" issue:
 *     Update existing Polar subscription to match D1 tier
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 */

import { Polar } from "@polar-sh/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

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
    maxRetries = 5,
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("429") && attempt < maxRetries) {
                const delay = attempt * 15000;
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

// Data types - matches output from compare-d1-polar-users.ts
interface PolarIssue {
    type: "polar-tier-mismatch";
    email: string;
    d1: {
        id: string;
        tier: TierName;
        name: string;
        github_username: string | null;
        github_id: number | null;
        created_at: string;
    };
    polar: {
        tier: TierName | null;
        customerId: string | null;
        subscriptionId: string | null;
    };
}

interface MismatchFile {
    overview: {
        comparedAt: string;
        polarDataFetchedAt: string;
        totalCount: number;
        description: string;
    };
    users: PolarIssue[];
}

type ProductMap = Map<string, { id: string; name: string }>;

const MISMATCHES_PATH = new URL(
    "./data/polar-tier-mismatch.json",
    import.meta.url,
).pathname;

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

async function main() {
    console.log("=".repeat(60));
    console.log("  APPLY FIXES TO POLAR SUBSCRIPTIONS");
    console.log("=".repeat(60));

    // Load mismatches
    if (!existsSync(MISMATCHES_PATH)) {
        console.error(`\n❌ Mismatches file not found: ${MISMATCHES_PATH}`);
        console.error("   Run compare-d1-polar-users.ts first!");
        process.exit(1);
    }

    const data: MismatchFile = JSON.parse(
        readFileSync(MISMATCHES_PATH, "utf-8"),
    );
    console.log(`\nLoaded mismatches from: ${MISMATCHES_PATH}`);
    console.log(`  Compared at: ${data.overview.comparedAt}`);
    console.log(`  Polar data from: ${data.overview.polarDataFetchedAt}`);

    // All users in this file are tier mismatches
    const tierMismatches = data.users;

    console.log(`\n📊 Summary:`);
    console.log(`   Tier mismatches to fix: ${tierMismatches.length}`);

    if (tierMismatches.length === 0) {
        console.log("\n✅ No tier mismatches to fix!");
        return;
    }

    // Confirm
    console.log("\n" + "-".repeat(60));
    console.log("TIER MISMATCHES TO FIX:");
    console.log("-".repeat(60));
    for (const m of tierMismatches.slice(0, 10)) {
        console.log(`  🔄 ${m.email}: Polar ${m.polar.tier} → D1 ${m.d1.tier}`);
    }
    if (tierMismatches.length > 10) {
        console.log(`  ... and ${tierMismatches.length - 10} more`);
    }

    const mode = await promptUser(
        `\nHow do you want to proceed?\n  [a] Apply all fixes automatically\n  [i] Interactive (confirm each)\n  [n] Cancel\nChoice: `,
    );

    if (mode === "n" || mode === "") {
        console.log("Cancelled.");
        return;
    }

    // Initialize Polar
    const polar = createPolarClient();
    const productMap = await getTierProductMap(polar);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < tierMismatches.length; i++) {
        const m = tierMismatches[i];

        if (mode === "i") {
            console.log(`\n[${i + 1}/${tierMismatches.length}] ${m.email}`);
            console.log(`  Polar: ${m.polar.tier} → D1: ${m.d1.tier}`);
            const confirm = await promptUser(`  Apply? (y/n/q): `);
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

        if (!m.polar.subscriptionId) {
            console.log(`  ❌ No subscription ID for ${m.email}`);
            errors++;
            continue;
        }

        try {
            await withRetry(
                () =>
                    polar.subscriptions.update({
                        id: m.polar.subscriptionId!,
                        subscriptionUpdate: {
                            productId: product.id,
                        },
                    }),
                `update ${m.email}`,
            );

            if (mode === "a") {
                console.log(
                    `  ✅ [${i + 1}/${tierMismatches.length}] ${m.email}: ${m.polar.tier} → ${m.d1.tier}`,
                );
            } else {
                console.log(`  ✅ Updated to ${m.d1.tier}`);
            }
            updated++;
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
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);

    if (updated > 0) {
        console.log("\n⚠️  Remember to re-fetch Polar data to verify changes:");
        console.log("   npx tsx scripts/tier-sync/fetch-polar-data.ts");
    }
}

main().catch(console.error);
