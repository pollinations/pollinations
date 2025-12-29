#!/usr/bin/env npx tsx
/**
 * Compare local Polar data against D1 database.
 *
 * Usage:
 *   npx tsx scripts/tier-sync/compare-tiers.ts
 *
 * Input:
 *   scripts/tier-sync/data/polar-data.json (run fetch-polar-data.ts first)
 *
 * Output:
 *   scripts/tier-sync/data/mismatches.json
 *   Console report
 *
 * Logic:
 *   - D1 is source of truth
 *   - D1 tier → Polar (update Polar to match D1)
 *   - Flags anomalies: users in Polar but not in D1
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync } from "fs";

const execAsync = promisify(exec);

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

function isValidTier(tier: string): tier is TierName {
    return TIERS.includes(tier as TierName);
}

// Data types
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

interface D1User {
    id: string;
    email: string;
    tier: string;
}

// Mismatch types
type MismatchType = "tier_mismatch" | "missing_in_polar" | "duplicate_polar";
type AnomalyType = "in_polar_not_d1";

interface Mismatch {
    type: MismatchType;
    email: string;
    d1Tier: TierName;
    polarTier: TierName | null;
    subscriptionId: string | null;
    customerId: string | null;
}

interface Anomaly {
    type: AnomalyType;
    email: string;
    polarTier: TierName;
    subscriptionId: string;
    customerId: string;
}

interface CompareResult {
    comparedAt: string;
    polarDataFetchedAt: string;
    summary: {
        d1Users: number;
        d1PaidUsers: number;
        polarSubscriptions: number;
        mismatches: number;
        missingInPolar: number;
        duplicatesInPolar: number;
        anomalies: number;
    };
    mismatches: Mismatch[];
    anomalies: Anomaly[];
}

const POLAR_DATA_PATH = new URL("./data/polar-data.json", import.meta.url)
    .pathname;
const OUTPUT_PATH = new URL("./data/mismatches.json", import.meta.url).pathname;

async function queryD1Users(): Promise<D1User[]> {
    console.log("  Querying D1 for all users...");
    // Unset CLOUDFLARE_API_TOKEN to use OAuth instead (the token only has read permission)
    const env = { ...process.env };
    delete env.CLOUDFLARE_API_TOKEN;
    const { stdout } = await execAsync(
        `npx wrangler d1 execute DB --remote --env production --command "SELECT id, email, tier FROM user" --json`,
        { env },
    );
    const result = JSON.parse(stdout);
    const users = (result[0]?.results as D1User[]) || [];
    console.log(`  Found ${users.length} users in D1`);
    return users;
}

async function main() {
    console.log("=".repeat(60));
    console.log("  COMPARE TIERS: D1 vs Polar");
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
    console.log(`  Subscriptions: ${polarData.totalSubscriptions}`);

    // Check if data is stale (> 1 hour old)
    const fetchedAt = new Date(polarData.fetchedAt);
    const hoursOld = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);
    if (hoursOld > 1) {
        console.log(
            `\n⚠️  Data is ${hoursOld.toFixed(1)} hours old. Consider re-fetching.`,
        );
    }

    // Build Polar lookup by email
    const polarByEmail = new Map<string, PolarSubscriptionData[]>();
    for (const sub of polarData.subscriptions) {
        const email = sub.customerEmail.toLowerCase();
        if (!polarByEmail.has(email)) {
            polarByEmail.set(email, []);
        }
        polarByEmail.get(email)!.push(sub);
    }

    // Fetch D1 users
    console.log("");
    const d1Users = await queryD1Users();

    // Build D1 lookup by email
    const d1ByEmail = new Map<string, D1User>();
    for (const user of d1Users) {
        d1ByEmail.set(user.email.toLowerCase(), user);
    }

    // Compare: D1 is source of truth
    console.log("\nComparing tiers (D1 → Polar)...\n");

    const mismatches: Mismatch[] = [];
    const anomalies: Anomaly[] = [];
    let d1PaidUsers = 0;

    // Check each D1 user with paid tier
    for (const d1User of d1Users) {
        if (!isValidTier(d1User.tier)) continue;
        if (d1User.tier === "spore") continue; // Skip free tier

        d1PaidUsers++;
        const email = d1User.email.toLowerCase();
        const polarSubs = polarByEmail.get(email) || [];

        if (polarSubs.length === 0) {
            // D1 has paid tier, but no Polar subscription
            mismatches.push({
                type: "missing_in_polar",
                email: d1User.email,
                d1Tier: d1User.tier,
                polarTier: null,
                subscriptionId: null,
                customerId: null,
            });
        } else if (polarSubs.length > 1) {
            // Multiple Polar subscriptions - flag as duplicate
            mismatches.push({
                type: "duplicate_polar",
                email: d1User.email,
                d1Tier: d1User.tier,
                polarTier: polarSubs[0].tier,
                subscriptionId: polarSubs[0].subscriptionId,
                customerId: polarSubs[0].customerId,
            });
        } else {
            // Single Polar subscription - check tier match
            const polarSub = polarSubs[0];
            if (polarSub.tier !== d1User.tier) {
                mismatches.push({
                    type: "tier_mismatch",
                    email: d1User.email,
                    d1Tier: d1User.tier,
                    polarTier: polarSub.tier,
                    subscriptionId: polarSub.subscriptionId,
                    customerId: polarSub.customerId,
                });
            }
        }
    }

    // Check for anomalies: users in Polar but not in D1
    for (const [email, subs] of polarByEmail) {
        if (!d1ByEmail.has(email)) {
            for (const sub of subs) {
                anomalies.push({
                    type: "in_polar_not_d1",
                    email: sub.customerEmail,
                    polarTier: sub.tier,
                    subscriptionId: sub.subscriptionId,
                    customerId: sub.customerId,
                });
            }
        }
    }

    // Build result
    const result: CompareResult = {
        comparedAt: new Date().toISOString(),
        polarDataFetchedAt: polarData.fetchedAt,
        summary: {
            d1Users: d1Users.length,
            d1PaidUsers,
            polarSubscriptions: polarData.totalSubscriptions,
            mismatches: mismatches.filter((m) => m.type === "tier_mismatch")
                .length,
            missingInPolar: mismatches.filter(
                (m) => m.type === "missing_in_polar",
            ).length,
            duplicatesInPolar: mismatches.filter(
                (m) => m.type === "duplicate_polar",
            ).length,
            anomalies: anomalies.length,
        },
        mismatches,
        anomalies,
    };

    // Write output
    writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));

    // Print report
    console.log("=".repeat(60));
    console.log("COMPARISON RESULTS:");
    console.log("=".repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   D1 total users: ${result.summary.d1Users}`);
    console.log(
        `   D1 paid users (seed/flower/nectar): ${result.summary.d1PaidUsers}`,
    );
    console.log(
        `   Polar tier subscriptions: ${result.summary.polarSubscriptions}`,
    );

    console.log(`\n🔄 Issues to fix (D1 → Polar):`);
    console.log(`   Tier mismatches: ${result.summary.mismatches}`);
    console.log(`   Missing in Polar: ${result.summary.missingInPolar}`);
    console.log(`   Duplicates in Polar: ${result.summary.duplicatesInPolar}`);

    console.log(`\n⚠️  Anomalies (investigate manually):`);
    console.log(`   In Polar but not D1: ${result.summary.anomalies}`);

    // Show details
    if (mismatches.length > 0) {
        console.log("\n" + "-".repeat(60));
        console.log("MISMATCHES (to fix):");
        console.log("-".repeat(60));
        for (const m of mismatches.slice(0, 20)) {
            const icon =
                m.type === "tier_mismatch"
                    ? "🔄"
                    : m.type === "missing_in_polar"
                      ? "➕"
                      : "📋";
            console.log(`  ${icon} ${m.email}`);
            console.log(
                `     D1: ${m.d1Tier} → Polar: ${m.polarTier || "(none)"}`,
            );
            if (m.type === "duplicate_polar") {
                console.log(`     ⚠️  Has multiple Polar subscriptions!`);
            }
        }
        if (mismatches.length > 20) {
            console.log(`  ... and ${mismatches.length - 20} more`);
        }
    }

    if (anomalies.length > 0) {
        console.log("\n" + "-".repeat(60));
        console.log("ANOMALIES (in Polar but not D1):");
        console.log("-".repeat(60));
        for (const a of anomalies.slice(0, 10)) {
            console.log(`  ❓ ${a.email} (${a.polarTier})`);
        }
        if (anomalies.length > 10) {
            console.log(`  ... and ${anomalies.length - 10} more`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`Output saved to: ${OUTPUT_PATH}`);
    console.log(
        `\nNext step: Run apply-fixes.ts to update Polar subscriptions`,
    );
}

main().catch(console.error);
