#!/usr/bin/env npx tsx

/**
 * Fetch all Polar subscription data and save to local JSON file.
 *
 * Usage:
 *   npx tsx scripts/manage-users/fetch-polar-data.ts
 *
 * Output:
 *   scripts/manage-users/data/polar-data.json
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Polar } from "@polar-sh/sdk";

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

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

// Data types for export
interface PolarSubscriptionData {
    subscriptionId: string;
    customerId: string;
    customerEmail: string;
    tier: TierName;
    productId: string;
    productName: string;
    status: string;
    createdAt: string;
}

interface PolarDataFile {
    fetchedAt: string;
    totalSubscriptions: number;
    subscriptions: PolarSubscriptionData[];
}

const OUTPUT_PATH = new URL("./data/polar-data.json", import.meta.url).pathname;

async function main() {
    const polar = createPolarClient();

    console.log("=".repeat(60));
    console.log("  FETCH POLAR SUBSCRIPTION DATA");
    console.log("=".repeat(60));

    const subscriptionsMap = new Map<string, PolarSubscriptionData>();
    let page = 1;
    let hasMore = true;

    console.log("\nFetching active subscriptions from Polar...\n");

    while (hasMore) {
        const response = await withRetry(
            () =>
                polar.subscriptions.list({
                    active: true,
                    limit: 100,
                    page,
                }),
            `subscriptions.list page ${page}`,
        );
        const items = response.result.items;
        if (items.length === 0) break;

        for (const sub of items) {
            const slug = (sub.product?.metadata?.slug as string) || "";
            const match = slug.match(/^v1:product:tier:(\w+)$/);

            // Only track tier subscriptions
            if (!match?.[1] || !isValidTier(match[1])) continue;

            subscriptionsMap.set(sub.id, {
                subscriptionId: sub.id,
                customerId: sub.customer.id,
                customerEmail: sub.customer.email.toLowerCase(),
                tier: match[1],
                productId: sub.product?.id || "",
                productName: sub.product?.name || "Unknown",
                status: sub.status,
                createdAt: sub.createdAt.toISOString(),
            });
        }

        console.log(
            `  Page ${page}: ${items.length} subscriptions (${subscriptionsMap.size} tier subs so far)`,
        );
        hasMore = items.length === 100;
        page++;
        await sleep(500);
    }

    // Convert to array
    const subscriptions = Array.from(subscriptionsMap.values());

    // Create output
    const output: PolarDataFile = {
        fetchedAt: new Date().toISOString(),
        totalSubscriptions: subscriptions.length,
        subscriptions,
    };

    // Ensure directory exists
    const dir = dirname(OUTPUT_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    // Write file
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    console.log(`\n${"=".repeat(60)}`);
    console.log("DONE:");
    console.log(`  Total tier subscriptions: ${subscriptions.length}`);
    console.log(
        `  Unique customers: ${new Set(subscriptions.map((s) => s.customerId)).size}`,
    );
    console.log(`  Output file: ${OUTPUT_PATH}`);
    console.log(`  Fetched at: ${output.fetchedAt}`);

    // Check for duplicates
    const emailCounts = new Map<string, number>();
    for (const sub of subscriptions) {
        emailCounts.set(
            sub.customerEmail,
            (emailCounts.get(sub.customerEmail) || 0) + 1,
        );
    }
    const duplicates = [...emailCounts.entries()].filter(
        ([, count]) => count > 1,
    );
    if (duplicates.length > 0) {
        console.log(
            `\n⚠️  Found ${duplicates.length} customers with MULTIPLE subscriptions:`,
        );
        for (const [email, count] of duplicates.slice(0, 10)) {
            console.log(`   - ${email}: ${count} subscriptions`);
        }
        if (duplicates.length > 10) {
            console.log(`   ... and ${duplicates.length - 10} more`);
        }
    }
}

main().catch(console.error);
