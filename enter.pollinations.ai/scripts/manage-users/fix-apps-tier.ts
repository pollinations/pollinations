#!/usr/bin/env npx tsx
/**
 * Fix apps tier issues - upgrade app contributors to flower tier in Polar
 *
 * Usage:
 *   npx tsx scripts/manage-users/fix-apps-tier.ts
 *
 * Input:
 *   scripts/manage-users/data/apps-tier-issues.json (run compare-apps-polar-users.ts first)
 *
 * Actions:
 *   - For each user with "tier-too-low" issue (spore/seed):
 *     Update their Polar subscription to flower tier
 *
 * Note:
 *   - Skips "not-in-polar" users (they need to create an account first)
 *   - Only updates Polar subscriptions (Polar is source of truth for tiers)
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 */

import { Polar } from "@polar-sh/sdk";
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

// Tier definitions
const TARGET_TIER = "flower";

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

// Data types - matches output from compare-apps-polar-users.ts
interface TierIssue {
    app: string;
    githubId: number;
    githubUsername: string;
    email: string | null;
    category: string;
    submitted: string;
    tier: string | null;
    subscriptionId: string | null;
    issue: "tier-too-low" | "not-in-polar";
}

interface IssuesFile {
    comparedAt: string;
    summary: {
        totalApps: number;
        appsWithGithubId: number;
        appsWithoutGithubId: number;
        issues: {
            "tier-too-low": number;
            "not-in-polar": number;
            total: number;
        };
        ok: number;
    };
    issues: TierIssue[];
}

type ProductMap = Map<string, { id: string; name: string }>;

const ISSUES_PATH = new URL("./data/apps-tier-issues.json", import.meta.url)
    .pathname;

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
    console.log("  UPGRADE APP CONTRIBUTORS TO FLOWER TIER");
    console.log("=".repeat(60));

    // Load issues
    if (!existsSync(ISSUES_PATH)) {
        console.error(`\n❌ Issues file not found: ${ISSUES_PATH}`);
        console.error("   Run compare-apps-polar-users.ts first!");
        process.exit(1);
    }

    const data: IssuesFile = JSON.parse(readFileSync(ISSUES_PATH, "utf-8"));
    console.log(`\nLoaded issues from: ${ISSUES_PATH}`);
    console.log(`  Compared at: ${data.comparedAt}`);

    // Filter to only tier-too-low issues
    const tierTooLow = data.issues.filter((i) => i.issue === "tier-too-low");

    // Deduplicate by githubId (same user may have multiple apps)
    const uniqueUsers = new Map<number, TierIssue>();
    for (const issue of tierTooLow) {
        if (!uniqueUsers.has(issue.githubId)) {
            uniqueUsers.set(issue.githubId, issue);
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Tier-too-low issues: ${tierTooLow.length} apps`);
    console.log(`   Unique users to upgrade: ${uniqueUsers.size}`);

    if (uniqueUsers.size === 0) {
        console.log("\n✅ No users to upgrade!");
        return;
    }

    // Group by current tier
    const byTier = new Map<string, TierIssue[]>();
    for (const issue of uniqueUsers.values()) {
        const tier = issue.tier || "null";
        if (!byTier.has(tier)) byTier.set(tier, []);
        const list = byTier.get(tier);
        if (list) list.push(issue);
    }

    console.log("\n" + "-".repeat(60));
    console.log("USERS TO UPGRADE TO FLOWER:");
    console.log("-".repeat(60));
    for (const [tier, issues] of byTier) {
        console.log(`\n  ${tier} → flower (${issues.length}):`);
        for (const i of issues.slice(0, 5)) {
            console.log(`    - @${i.githubUsername} (${i.app})`);
        }
        if (issues.length > 5) {
            console.log(`    ... and ${issues.length - 5} more`);
        }
    }

    const mode = await promptUser(
        `\nHow do you want to proceed?\n  [a] Apply all upgrades automatically\n  [i] Interactive (confirm each)\n  [n] Cancel\nChoice: `,
    );

    if (mode === "n" || mode === "") {
        console.log("Cancelled.");
        return;
    }

    // Initialize Polar
    const polar = createPolarClient();
    const productMap = await getTierProductMap(polar);
    const flowerProduct = productMap.get(tierProductSlug(TARGET_TIER));

    if (!flowerProduct) {
        console.error(`\n❌ Could not find flower tier product in Polar`);
        process.exit(1);
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let noSubId = 0;

    const users = Array.from(uniqueUsers.values());
    for (let i = 0; i < users.length; i++) {
        const user = users[i];

        if (mode === "i") {
            console.log(
                `\n[${i + 1}/${users.length}] @${user.githubUsername} (${user.tier} → flower)`,
            );
            console.log(`  App: ${user.app}`);
            console.log(`  Email: ${user.email || "unknown"}`);
            const confirm = await promptUser(`  Upgrade? (y/n/q): `);
            if (confirm === "q") {
                console.log("Quitting...");
                break;
            }
            if (confirm !== "y") {
                skipped++;
                continue;
            }
        }

        // Check if we have a subscription ID
        if (!user.subscriptionId) {
            if (mode === "a") {
                console.log(
                    `  ⚠️ [${i + 1}/${users.length}] @${user.githubUsername}: no subscriptionId`,
                );
            } else {
                console.log(`  ⚠️ No subscription ID - skipping`);
            }
            noSubId++;
            continue;
        }

        // Update Polar subscription
        try {
            await withRetry(
                () =>
                    polar.subscriptions.update({
                        id: user.subscriptionId!,
                        subscriptionUpdate: {
                            productId: flowerProduct.id,
                        },
                    }),
                `update ${user.githubUsername}`,
            );

            if (mode === "a") {
                console.log(
                    `  ✅ [${i + 1}/${users.length}] @${user.githubUsername}: ${user.tier} → flower`,
                );
            } else {
                console.log(`  ✅ Upgraded to flower`);
            }
            updated++;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`  ❌ Error: ${msg}`);
            errors++;
        }

        await sleep(2000); // Rate limit protection
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("DONE:");
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  No subscription ID: ${noSubId}`);
    console.log(`  Errors: ${errors}`);

    if (updated > 0) {
        console.log("\n⚠️  Remember to re-fetch Polar data to verify:");
        console.log("   npx tsx scripts/manage-users/fetch-polar-data.ts");
        console.log(
            "   npx tsx scripts/manage-users/compare-apps-polar-users.ts",
        );
    }
}

main().catch(console.error);
