#!/usr/bin/env npx tsx
/// <reference types="node" />
/**
 * Fix polar-duplicate-subscription issues
 *
 * Some customers have multiple active subscriptions due to historical bugs.
 * This script identifies them and allows interactive cleanup.
 *
 * Usage:
 *   npx tsx scripts/manage-users/fix-polar-duplicate-subscription.ts [--dry-run]
 *
 * Input:
 *   scripts/manage-users/data/polar-duplicate-subscription.json (run compare-d1-polar-users.ts first)
 *
 * Logic:
 *   - Keep the subscription with the HIGHEST tier
 *   - If same tier, keep the OLDEST (first created)
 *   - Revoke the duplicates
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 */

import { Polar } from "@polar-sh/sdk";
import { readFileSync, existsSync } from "fs";
import { createInterface } from "readline";

// Tier hierarchy (higher index = higher tier)
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

function tierFromProductName(productName: string): TierName | null {
    const lower = productName.toLowerCase();
    for (const tier of TIERS) {
        if (lower.includes(tier)) return tier;
    }
    return null;
}

function tierRank(tier: TierName | null): number {
    if (!tier) return -1;
    return TIERS.indexOf(tier);
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

// Types from polar-data.json
interface PolarSubscriptionData {
    subscriptionId: string;
    productId: string;
    productName: string;
    customerId: string;
    customerEmail: string;
    status: string;
    createdAt: string;
}

interface PolarDataFile {
    fetchedAt: string;
    totalSubscriptions: number;
    uniqueCustomers: number;
    subscriptions: PolarSubscriptionData[];
}

interface DuplicateGroup {
    email: string;
    subscriptions: PolarSubscriptionData[];
    keep: PolarSubscriptionData;
    revoke: PolarSubscriptionData[];
}

const POLAR_DATA_PATH = new URL("./data/polar-data.json", import.meta.url)
    .pathname;

// Parse command line arguments
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    console.log("=".repeat(60));
    console.log(
        DRY_RUN
            ? "  CLEANUP DUPLICATE SUBSCRIPTIONS (DRY RUN)"
            : "  CLEANUP DUPLICATE SUBSCRIPTIONS",
    );
    console.log("=".repeat(60));

    // Load Polar data
    if (!existsSync(POLAR_DATA_PATH)) {
        console.error(`\n❌ Polar data file not found: ${POLAR_DATA_PATH}`);
        console.error("   Run fetch-polar-data.ts first!");
        process.exit(1);
    }

    const polarData: PolarDataFile = JSON.parse(
        readFileSync(POLAR_DATA_PATH, "utf-8"),
    );
    console.log(`\nLoaded Polar data from: ${POLAR_DATA_PATH}`);
    console.log(`  Fetched at: ${polarData.fetchedAt}`);

    // Group by email
    const byEmail = new Map<string, PolarSubscriptionData[]>();
    for (const sub of polarData.subscriptions) {
        const email = sub.customerEmail.toLowerCase();
        if (!byEmail.has(email)) {
            byEmail.set(email, []);
        }
        byEmail.get(email)!.push(sub);
    }

    // Find duplicates
    const duplicates: DuplicateGroup[] = [];
    let skippedFakeDuplicates = 0;
    for (const [email, subs] of byEmail) {
        if (subs.length > 1) {
            // Deduplicate by subscriptionId (in case fetch had duplicates)
            const uniqueSubs = Array.from(
                new Map(subs.map((s) => [s.subscriptionId, s])).values(),
            );

            // Skip if all entries were the same subscription
            if (uniqueSubs.length === 1) {
                skippedFakeDuplicates++;
                continue;
            }

            // Sort by tier (highest first), then by createdAt (oldest first)
            const sorted = [...uniqueSubs].sort((a, b) => {
                const tierA = tierRank(tierFromProductName(a.productName));
                const tierB = tierRank(tierFromProductName(b.productName));
                if (tierB !== tierA) return tierB - tierA; // Higher tier first
                // Same tier: oldest first
                return (
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );
            });

            duplicates.push({
                email,
                subscriptions: sorted,
                keep: sorted[0],
                revoke: sorted.slice(1),
            });
        }
    }

    if (skippedFakeDuplicates > 0) {
        console.log(
            `\nℹ️  Skipped ${skippedFakeDuplicates} fake duplicates (same subscription ID appearing multiple times in data)`,
        );
        console.log(
            `   Consider re-running fetch-polar-data.ts to get clean data.\n`,
        );
    }

    if (duplicates.length === 0) {
        console.log("\n✅ No duplicate subscriptions found!");
        return;
    }

    console.log(`\n⚠️  Found ${duplicates.length} customers with duplicates:\n`);

    // Show details with subscription IDs for debugging
    for (let i = 0; i < duplicates.length; i++) {
        const d = duplicates[i];
        const revokeIds = new Set(d.revoke.map((s) => s.subscriptionId));
        console.log(
            `${i + 1}. ${d.email} (${d.subscriptions.length} subscriptions)`,
        );
        for (const sub of d.subscriptions) {
            const tier = tierFromProductName(sub.productName) || "unknown";
            const isRevoke = revokeIds.has(sub.subscriptionId);
            const marker = isRevoke ? "✗ REVOKE" : "✓ KEEP";
            const created = new Date(sub.createdAt).toISOString().split("T")[0];
            const shortId = sub.subscriptionId.slice(-8);
            console.log(`   ${marker}: ${tier} (${created}) [${shortId}]`);
        }
        console.log();
    }

    // Summary
    const totalRevoke = duplicates.reduce((sum, d) => sum + d.revoke.length, 0);
    console.log("-".repeat(60));
    console.log(`SUMMARY:`);
    console.log(`  Customers with duplicates: ${duplicates.length}`);
    console.log(`  Subscriptions to KEEP: ${duplicates.length}`);
    console.log(`  Subscriptions to REVOKE: ${totalRevoke}`);
    console.log("-".repeat(60));

    // Dry run mode - exit early
    if (DRY_RUN) {
        console.log("\n🧪 DRY RUN MODE - No changes will be made");
        console.log("   Remove --dry-run to execute changes\n");
        return;
    }

    // Confirm
    const mode = await promptUser(
        `\nHow do you want to proceed?\n  [a] Revoke all duplicates automatically\n  [i] Interactive (confirm each customer)\n  [n] Cancel\nChoice: `,
    );

    if (mode === "n" || mode === "") {
        console.log("Cancelled.");
        return;
    }

    // Initialize Polar
    const polar = createPolarClient();

    let revoked = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < duplicates.length; i++) {
        const d = duplicates[i];

        if (mode === "i") {
            console.log(`\n[${i + 1}/${duplicates.length}] ${d.email}`);
            console.log(`  Keep: ${tierFromProductName(d.keep.productName)}`);
            console.log(
                `  Revoke: ${d.revoke.map((s) => tierFromProductName(s.productName)).join(", ")}`,
            );
            const confirm = await promptUser(`  Proceed? (y/n/q): `);
            if (confirm === "q") {
                console.log("Quitting...");
                break;
            }
            if (confirm !== "y") {
                skipped += d.revoke.length;
                continue;
            }
        }

        // Revoke duplicates
        for (const sub of d.revoke) {
            try {
                await withRetry(
                    () =>
                        polar.subscriptions.revoke({
                            id: sub.subscriptionId,
                        }),
                    `revoke ${sub.subscriptionId}`,
                );

                if (mode === "a") {
                    console.log(
                        `  ✅ [${i + 1}/${duplicates.length}] ${d.email}: revoked ${tierFromProductName(sub.productName)}`,
                    );
                } else {
                    console.log(
                        `  ✅ Revoked ${tierFromProductName(sub.productName)}`,
                    );
                }
                revoked++;
                await sleep(2000); // Rate limit protection
            } catch (error: unknown) {
                const msg =
                    error instanceof Error ? error.message : String(error);
                console.log(
                    `  ❌ Error revoking ${sub.subscriptionId}: ${msg}`,
                );
                errors++;
            }
        }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("DONE:");
    console.log(`  Revoked: ${revoked}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);

    if (revoked > 0) {
        console.log("\n⚠️  Remember to re-fetch Polar data to verify changes:");
        console.log("   npx tsx scripts/manage-users/fetch-polar-data.ts");
    }
}

main().catch(console.error);
