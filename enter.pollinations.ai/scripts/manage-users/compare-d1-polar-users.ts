#!/usr/bin/env npx tsx
/**
 * Compare D1 users with Polar subscriptions.
 *
 * Usage:
 *   npx tsx scripts/manage-users/compare-d1-polar-users.ts
 *
 * Input:
 *   scripts/manage-users/data/polar-data.json (run fetch-polar-data.ts first)
 *
 * Output:
 *   scripts/manage-users/data/*.json (overview, polar-*, d1-*)
 *   Console report
 *
 * Logic:
 *   - D1 is source of truth
 *   - D1 tier → Polar (update Polar to match D1)
 *   - Flags anomalies: users in Polar but not in D1
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar", "router"] as const;
type TierName = (typeof TIERS)[number];

// Admin tiers don't need Polar subscriptions
const ADMIN_TIERS = ["router"] as const;

function isValidTier(tier: string): tier is TierName {
    return TIERS.includes(tier as TierName);
}

function isAdminTier(tier: string): boolean {
    return ADMIN_TIERS.includes(tier as (typeof ADMIN_TIERS)[number]);
}

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString().split("T")[0];
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
    name: string;
    github_username: string | null;
    github_id: number | null;
    created_at: number; // Raw timestamp from DB
}

// Issue types - format: {where-problem-is}-{what-is-wrong}
type PolarIssueType =
    | "polar-tier-mismatch"
    | "polar-subscription-missing"
    | "polar-duplicate-subscription";
type D1IssueType = "d1-user-missing" | "d1-tier-missing";

interface PolarIssue {
    type: PolarIssueType;
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

interface D1UserMissingIssue {
    type: "d1-user-missing";
    email: string;
    polar: {
        tier: TierName;
        customerId: string;
        subscriptionId: string;
    };
}

interface D1TierMissingIssue {
    type: "d1-tier-missing";
    email: string;
    d1: {
        id: string;
        tier: string | null;
        name: string;
        github_username: string | null;
        github_id: number | null;
        created_at: string;
    };
}

type D1Issue = D1UserMissingIssue | D1TierMissingIssue;

interface TierBreakdown {
    spore: number;
    seed: number;
    flower: number;
    nectar: number;
    router: number;
    noTier: number;
    mismatches?: number;
}

interface CompareResult {
    comparedAt: string;
    polarDataFetchedAt: string;
    summary: {
        d1: {
            total: number;
            breakdown: TierBreakdown;
        };
        polar: {
            total: number;
            breakdown: TierBreakdown;
        };
        issues: {
            "polar-tier-mismatch": number;
            "polar-subscription-missing": number;
            "polar-duplicate-subscription": number;
            "d1-user-missing": number;
            "d1-tier-missing": number;
        };
    };
    polarIssues: PolarIssue[];
    d1Issues: D1Issue[];
}

const POLAR_DATA_PATH = new URL("./data/polar-data.json", import.meta.url)
    .pathname;
const OUTPUT_DIR = new URL("./data", import.meta.url).pathname;
const OVERVIEW_PATH = `${OUTPUT_DIR}/overview.json`;
const POLAR_TIER_MISMATCH_PATH = `${OUTPUT_DIR}/polar-tier-mismatch.json`;
const POLAR_SUBSCRIPTION_MISSING_PATH = `${OUTPUT_DIR}/polar-subscription-missing.json`;
const POLAR_DUPLICATE_SUBSCRIPTION_PATH = `${OUTPUT_DIR}/polar-duplicate-subscription.json`;
const D1_USER_MISSING_PATH = `${OUTPUT_DIR}/d1-user-missing.json`;
const D1_TIER_MISSING_PATH = `${OUTPUT_DIR}/d1-tier-missing.json`;

async function queryD1Users(): Promise<D1User[]> {
    console.log("  Querying D1 for all users...");
    // Unset CLOUDFLARE_API_TOKEN to use OAuth instead (the token only has read permission)
    const env = { ...process.env };
    delete env.CLOUDFLARE_API_TOKEN;
    const { stdout } = await execAsync(
        `npx wrangler d1 execute DB --remote --env production --command "SELECT id, email, tier, name, github_username, github_id, created_at FROM user" --json`,
        { env, maxBuffer: 50 * 1024 * 1024 }, // 50MB buffer
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
        polarByEmail.get(email)?.push(sub);
    }

    // Fetch D1 users
    console.log("");
    const d1Users = await queryD1Users();

    // Build D1 lookup by email
    const d1ByEmail = new Map<string, D1User>();
    for (const user of d1Users) {
        d1ByEmail.set(user.email.toLowerCase(), user);
    }

    // Calculate D1 tier breakdown
    console.log("\nAnalyzing tier distributions...\n");
    const d1Breakdown: TierBreakdown = {
        spore: 0,
        seed: 0,
        flower: 0,
        nectar: 0,
        router: 0,
        noTier: 0,
    };
    for (const user of d1Users) {
        if (isValidTier(user.tier)) {
            d1Breakdown[user.tier]++;
        } else {
            d1Breakdown.noTier++;
        }
    }

    // Calculate Polar tier breakdown
    const polarBreakdown: TierBreakdown = {
        spore: 0,
        seed: 0,
        flower: 0,
        nectar: 0,
        router: 0,
        noTier: 0,
        mismatches: 0,
    };
    for (const sub of polarData.subscriptions) {
        polarBreakdown[sub.tier]++;
    }

    // Compare and find issues
    const polarIssues: PolarIssue[] = [];
    const d1Issues: D1Issue[] = [];

    // Check each D1 user
    for (const d1User of d1Users) {
        // Track D1 users with no valid tier as an issue
        if (!isValidTier(d1User.tier)) {
            d1Issues.push({
                type: "d1-tier-missing",
                email: d1User.email,
                d1: {
                    id: d1User.id,
                    tier: d1User.tier,
                    name: d1User.name,
                    github_username: d1User.github_username,
                    github_id: d1User.github_id,
                    created_at: formatDate(d1User.created_at),
                },
            });
            continue;
        }

        const email = d1User.email.toLowerCase();
        const polarSubs = polarByEmail.get(email) || [];

        if (polarSubs.length === 0) {
            // D1 user has no Polar subscription
            // Skip admin tiers - they don't need Polar subscriptions
            if (isAdminTier(d1User.tier)) {
                continue;
            }
            polarIssues.push({
                type: "polar-subscription-missing",
                email: d1User.email,
                d1: {
                    id: d1User.id,
                    tier: d1User.tier,
                    name: d1User.name,
                    github_username: d1User.github_username,
                    github_id: d1User.github_id,
                    created_at: formatDate(d1User.created_at),
                },
                polar: {
                    tier: null,
                    customerId: null,
                    subscriptionId: null,
                },
            });
        } else if (polarSubs.length > 1) {
            // Multiple Polar subscriptions
            polarIssues.push({
                type: "polar-duplicate-subscription",
                email: d1User.email,
                d1: {
                    id: d1User.id,
                    tier: d1User.tier,
                    name: d1User.name,
                    github_username: d1User.github_username,
                    github_id: d1User.github_id,
                    created_at: formatDate(d1User.created_at),
                },
                polar: {
                    tier: polarSubs[0].tier,
                    customerId: polarSubs[0].customerId,
                    subscriptionId: polarSubs[0].subscriptionId,
                },
            });
        } else {
            // Single Polar subscription - check tier match
            const polarSub = polarSubs[0];
            if (polarSub.tier !== d1User.tier) {
                polarIssues.push({
                    type: "polar-tier-mismatch",
                    email: d1User.email,
                    d1: {
                        id: d1User.id,
                        tier: d1User.tier,
                        name: d1User.name,
                        github_username: d1User.github_username,
                        github_id: d1User.github_id,
                        created_at: formatDate(d1User.created_at),
                    },
                    polar: {
                        tier: polarSub.tier,
                        customerId: polarSub.customerId,
                        subscriptionId: polarSub.subscriptionId,
                    },
                });
            }
        }
    }

    // Check for users in Polar but not in D1
    for (const [email, subs] of polarByEmail) {
        if (!d1ByEmail.has(email)) {
            for (const sub of subs) {
                d1Issues.push({
                    type: "d1-user-missing",
                    email: sub.customerEmail,
                    polar: {
                        tier: sub.tier,
                        customerId: sub.customerId,
                        subscriptionId: sub.subscriptionId,
                    },
                });
            }
        }
    }

    // Split issues by type for easier access
    const polarTierMismatch = polarIssues.filter(
        (m) => m.type === "polar-tier-mismatch",
    );
    const polarSubscriptionMissing = polarIssues.filter(
        (m) => m.type === "polar-subscription-missing",
    );
    const polarDuplicateSubscription = polarIssues.filter(
        (m) => m.type === "polar-duplicate-subscription",
    );
    const d1UserMissing = d1Issues.filter((m) => m.type === "d1-user-missing");
    const d1TierMissing = d1Issues.filter((m) => m.type === "d1-tier-missing");

    // Build result
    const result: CompareResult = {
        comparedAt: new Date().toISOString(),
        polarDataFetchedAt: polarData.fetchedAt,
        summary: {
            d1: {
                total: d1Users.length,
                breakdown: d1Breakdown,
            },
            polar: {
                total: polarData.totalSubscriptions,
                breakdown: polarBreakdown,
            },
            issues: {
                "polar-tier-mismatch": polarTierMismatch.length,
                "polar-subscription-missing": polarSubscriptionMissing.length,
                "polar-duplicate-subscription":
                    polarDuplicateSubscription.length,
                "d1-user-missing": d1UserMissing.length,
                "d1-tier-missing": d1TierMissing.length,
            },
        },
        polarIssues,
        d1Issues,
    };

    // Calculate Polar issues for breakdown display
    polarBreakdown.noTier = result.summary.issues["polar-subscription-missing"];
    polarBreakdown.mismatches = result.summary.issues["polar-tier-mismatch"];

    // Write overview JSON
    writeFileSync(
        OVERVIEW_PATH,
        JSON.stringify(
            {
                comparedAt: result.comparedAt,
                polarDataFetchedAt: result.polarDataFetchedAt,
                summary: result.summary,
            },
            null,
            2,
        ),
    );

    // Write polar-tier-mismatch.json (only if there are issues)
    if (polarTierMismatch.length > 0) {
        writeFileSync(
            POLAR_TIER_MISMATCH_PATH,
            JSON.stringify(
                {
                    overview: {
                        comparedAt: result.comparedAt,
                        polarDataFetchedAt: result.polarDataFetchedAt,
                        totalCount: polarTierMismatch.length,
                        description:
                            "Polar subscription has wrong tier (should match D1)",
                    },
                    users: polarTierMismatch,
                },
                null,
                2,
            ),
        );
    }

    // Write polar-subscription-missing.json (only if there are issues)
    if (polarSubscriptionMissing.length > 0) {
        writeFileSync(
            POLAR_SUBSCRIPTION_MISSING_PATH,
            JSON.stringify(
                {
                    overview: {
                        comparedAt: result.comparedAt,
                        polarDataFetchedAt: result.polarDataFetchedAt,
                        totalCount: polarSubscriptionMissing.length,
                        description:
                            "D1 user has tier but no Polar subscription exists",
                    },
                    users: polarSubscriptionMissing,
                },
                null,
                2,
            ),
        );
    }

    // Write polar-duplicate-subscription.json (only if there are issues)
    if (polarDuplicateSubscription.length > 0) {
        writeFileSync(
            POLAR_DUPLICATE_SUBSCRIPTION_PATH,
            JSON.stringify(
                {
                    overview: {
                        comparedAt: result.comparedAt,
                        polarDataFetchedAt: result.polarDataFetchedAt,
                        totalCount: polarDuplicateSubscription.length,
                        description:
                            "User has multiple active Polar subscriptions",
                    },
                    users: polarDuplicateSubscription,
                },
                null,
                2,
            ),
        );
    }

    // Write d1-user-missing.json (only if there are issues)
    if (d1UserMissing.length > 0) {
        writeFileSync(
            D1_USER_MISSING_PATH,
            JSON.stringify(
                {
                    overview: {
                        comparedAt: result.comparedAt,
                        polarDataFetchedAt: result.polarDataFetchedAt,
                        totalCount: d1UserMissing.length,
                        description:
                            "Polar subscription exists but user not found in D1",
                    },
                    users: d1UserMissing,
                },
                null,
                2,
            ),
        );
    }

    // Write d1-tier-missing.json (only if there are issues)
    if (d1TierMissing.length > 0) {
        writeFileSync(
            D1_TIER_MISSING_PATH,
            JSON.stringify(
                {
                    overview: {
                        comparedAt: result.comparedAt,
                        polarDataFetchedAt: result.polarDataFetchedAt,
                        totalCount: d1TierMissing.length,
                        description:
                            "D1 user exists but has no valid tier assigned",
                    },
                    users: d1TierMissing,
                },
                null,
                2,
            ),
        );
    }

    // Print clean console report
    console.log("=".repeat(60));
    console.log("TIER COMPARISON SUMMARY");
    console.log("=".repeat(60));

    console.log("\n📊 D1:");
    console.log(`   Total users: ${result.summary.d1.total}`);
    console.log(`   ├─ Spore:    ${result.summary.d1.breakdown.spore}`);
    console.log(`   ├─ Seed:     ${result.summary.d1.breakdown.seed}`);
    console.log(`   ├─ Flower:   ${result.summary.d1.breakdown.flower}`);
    console.log(`   ├─ Nectar:   ${result.summary.d1.breakdown.nectar}`);
    console.log(`   ├─ Router:   ${result.summary.d1.breakdown.router}`);
    console.log(`   └─ No tier:  ${result.summary.d1.breakdown.noTier}`);

    console.log("\n📊 POLAR:");
    console.log(`   Total subscriptions: ${result.summary.polar.total}`);
    console.log(`   ├─ Spore:      ${result.summary.polar.breakdown.spore}`);
    console.log(`   ├─ Seed:       ${result.summary.polar.breakdown.seed}`);
    console.log(`   ├─ Flower:     ${result.summary.polar.breakdown.flower}`);
    console.log(`   └─ Nectar:     ${result.summary.polar.breakdown.nectar}`);

    console.log("\n⚠️  ISSUES:");
    console.log(
        `   ├─ polar-tier-mismatch:          ${result.summary.issues["polar-tier-mismatch"]}`,
    );
    console.log(
        `   ├─ polar-subscription-missing:   ${result.summary.issues["polar-subscription-missing"]}`,
    );
    console.log(
        `   ├─ polar-duplicate-subscription: ${result.summary.issues["polar-duplicate-subscription"]}`,
    );
    console.log(
        `   ├─ d1-user-missing:              ${result.summary.issues["d1-user-missing"]}`,
    );
    console.log(
        `   └─ d1-tier-missing:              ${result.summary.issues["d1-tier-missing"]}`,
    );

    const totalIssues =
        result.summary.issues["polar-tier-mismatch"] +
        result.summary.issues["polar-subscription-missing"] +
        result.summary.issues["polar-duplicate-subscription"] +
        result.summary.issues["d1-user-missing"] +
        result.summary.issues["d1-tier-missing"];

    console.log(`\n${"=".repeat(60)}`);
    if (totalIssues === 0) {
        console.log("✅ D1 and Polar are in sync!");
    } else {
        console.log(`📄 Output files:`);
        console.log(`   - ${OVERVIEW_PATH}`);
        if (polarTierMismatch.length > 0) {
            console.log(
                `   - ${POLAR_TIER_MISMATCH_PATH} (${polarTierMismatch.length})`,
            );
        }
        if (polarSubscriptionMissing.length > 0) {
            console.log(
                `   - ${POLAR_SUBSCRIPTION_MISSING_PATH} (${polarSubscriptionMissing.length})`,
            );
        }
        if (polarDuplicateSubscription.length > 0) {
            console.log(
                `   - ${POLAR_DUPLICATE_SUBSCRIPTION_PATH} (${polarDuplicateSubscription.length})`,
            );
        }
        if (d1UserMissing.length > 0) {
            console.log(
                `   - ${D1_USER_MISSING_PATH} (${d1UserMissing.length})`,
            );
        }
        if (d1TierMissing.length > 0) {
            console.log(
                `   - ${D1_TIER_MISSING_PATH} (${d1TierMissing.length})`,
            );
        }
        if (result.summary.issues["polar-tier-mismatch"] > 0) {
            console.log(
                `\n💡 Next: npx tsx scripts/manage-users/fix-polar-tier-mismatch.ts`,
            );
        }
        if (result.summary.issues["polar-subscription-missing"] > 0) {
            console.log(
                `💡 Next: npx tsx scripts/manage-users/fix-polar-missing-subscription.ts`,
            );
        }
    }
}

main().catch(console.error);
