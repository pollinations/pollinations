#!/usr/bin/env npx tsx
/**
 * Compare APPS.md contributors with Polar subscription tiers.
 *
 * Usage:
 *   npx tsx scripts/manage-users/compare-apps-polar-users.ts
 *
 * Checks if each GitHub user in APPS.md has a Flower or Nectar tier in Polar.
 * App contributors should have at least Flower tier.
 *
 * Input:
 *   scripts/manage-users/data/polar-data.json (run fetch-polar-data.ts first)
 *
 * Output:
 *   scripts/manage-users/data/apps-tier-issues.json
 *   Console report
 *
 * Logic:
 *   - Parse APPS.md to extract GitHub_UserID column
 *   - Query D1 to get email for each GitHub ID (minimal D1 use)
 *   - Look up tier in polar-data.json by email
 *   - Report apps with contributors who have lower tiers or no Polar subscription
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const execAsync = promisify(exec);

// Tier definitions
const TIERS = ["spore", "seed", "flower", "nectar", "router"] as const;
type TierName = (typeof TIERS)[number];

const REQUIRED_TIERS: TierName[] = ["flower", "nectar", "router"];

function isRequiredTier(tier: string): boolean {
    return REQUIRED_TIERS.includes(tier as TierName);
}

// Data types
interface AppEntry {
    name: string;
    githubUsername: string;
    githubId: number;
    category: string;
    submitted: string;
}

interface D1UserEmail {
    github_id: number;
    email: string;
}

interface PolarSubscription {
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
    subscriptions: PolarSubscription[];
}

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

interface CompareResult {
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

const APPS_MD_PATH = new URL("../../../apps/APPS.md", import.meta.url).pathname;
const POLAR_DATA_PATH = new URL("./data/polar-data.json", import.meta.url)
    .pathname;
const OUTPUT_DIR = new URL("./data", import.meta.url).pathname;
const OUTPUT_PATH = `${OUTPUT_DIR}/apps-tier-issues.json`;

function parseAppsMd(): AppEntry[] {
    const content = readFileSync(APPS_MD_PATH, "utf-8");
    const lines = content.split("\n");
    const apps: AppEntry[] = [];

    // Find header line
    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        throw new Error("Could not find header in APPS.md");
    }

    // Parse data rows (skip header and separator)
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|").map((c) => c.trim());
        // Columns: | Emoji | Name | Web_URL | Description | Language | Category | GitHub_Username | GitHub_UserID | Github_Repository_URL | Github_Repository_Stars | Discord_Username | Other | Submitted |
        // Index:     0       1      2         3             4          5          6                 7               8                       9                         10                 11      12

        const name = cols[2] || "";
        const category = cols[6] || "";
        const githubUsername = cols[7] || "";
        const githubIdStr = cols[8] || "";
        const submitted = cols[13] || "";

        const githubId = parseInt(githubIdStr, 10);

        if (name && githubId && !Number.isNaN(githubId)) {
            apps.push({
                name,
                githubUsername: githubUsername.replace(/^@/, ""),
                githubId,
                category,
                submitted,
            });
        }
    }

    return apps;
}

function loadPolarData(): Map<string, PolarSubscription> {
    if (!existsSync(POLAR_DATA_PATH)) {
        throw new Error(
            `Polar data not found: ${POLAR_DATA_PATH}\n  Run fetch-polar-data.ts first!`,
        );
    }

    const data: PolarDataFile = JSON.parse(
        readFileSync(POLAR_DATA_PATH, "utf-8"),
    );
    console.log(`  Loaded Polar data from: ${POLAR_DATA_PATH}`);
    console.log(`  Fetched at: ${data.fetchedAt}`);
    console.log(`  Total subscriptions: ${data.totalSubscriptions}`);

    // Build lookup by email (lowercase)
    const byEmail = new Map<string, PolarSubscription>();
    for (const sub of data.subscriptions) {
        byEmail.set(sub.customerEmail.toLowerCase(), sub);
    }
    return byEmail;
}

async function queryD1EmailsByGithubIds(
    githubIds: number[],
): Promise<Map<number, string>> {
    if (githubIds.length === 0) return new Map();

    console.log(
        `  Querying D1 for emails of ${githubIds.length} GitHub IDs...`,
    );

    // Split into chunks to avoid command line too long
    const chunkSize = 500;
    const emailMap = new Map<number, string>();

    for (let i = 0; i < githubIds.length; i += chunkSize) {
        const chunk = githubIds.slice(i, i + chunkSize);
        const idList = chunk.join(",");

        // Unset CLOUDFLARE_API_TOKEN to use OAuth instead
        const env = { ...process.env };
        delete env.CLOUDFLARE_API_TOKEN;

        try {
            const { stdout } = await execAsync(
                `npx wrangler d1 execute DB --remote --env production --command "SELECT github_id, email FROM user WHERE github_id IN (${idList})" --json`,
                { env, maxBuffer: 50 * 1024 * 1024 },
            );
            const result = JSON.parse(stdout);
            const users = (result[0]?.results as D1UserEmail[]) || [];

            for (const user of users) {
                emailMap.set(user.github_id, user.email.toLowerCase());
            }

            console.log(
                `    Chunk ${Math.floor(i / chunkSize) + 1}: found ${users.length} users`,
            );
        } catch (error) {
            console.error(`    Error querying chunk: ${error}`);
        }
    }

    console.log(`  Found ${emailMap.size} emails in D1`);
    return emailMap;
}

async function main() {
    console.log("=".repeat(60));
    console.log("  COMPARE APPS.MD CONTRIBUTORS WITH POLAR TIERS");
    console.log("=".repeat(60));

    // Load Polar data
    console.log("");
    const polarByEmail = loadPolarData();

    // Parse APPS.md
    console.log(`\nReading APPS.md from: ${APPS_MD_PATH}`);
    const apps = parseAppsMd();
    console.log(`  Found ${apps.length} apps with GitHub IDs`);

    // Get unique GitHub IDs
    const uniqueIds = [...new Set(apps.map((a) => a.githubId))];
    console.log(`  Unique GitHub IDs: ${uniqueIds.length}`);

    // Query D1 for email mapping only
    console.log("");
    const emailMap = await queryD1EmailsByGithubIds(uniqueIds);

    // Compare and find issues
    console.log("\nAnalyzing tiers from Polar...\n");
    const issues: TierIssue[] = [];
    let okCount = 0;

    for (const app of apps) {
        const email = emailMap.get(app.githubId);

        if (!email) {
            // No D1 account = no Polar subscription
            issues.push({
                app: app.name,
                githubId: app.githubId,
                githubUsername: app.githubUsername,
                email: null,
                category: app.category,
                submitted: app.submitted,
                tier: null,
                subscriptionId: null,
                issue: "not-in-polar",
            });
            continue;
        }

        const polarSub = polarByEmail.get(email);

        if (!polarSub) {
            issues.push({
                app: app.name,
                githubId: app.githubId,
                githubUsername: app.githubUsername,
                email,
                category: app.category,
                submitted: app.submitted,
                tier: null,
                subscriptionId: null,
                issue: "not-in-polar",
            });
        } else if (!isRequiredTier(polarSub.tier)) {
            issues.push({
                app: app.name,
                githubId: app.githubId,
                githubUsername: app.githubUsername,
                email,
                category: app.category,
                submitted: app.submitted,
                tier: polarSub.tier,
                subscriptionId: polarSub.subscriptionId,
                issue: "tier-too-low",
            });
        } else {
            okCount++;
        }
    }

    // Count issue types
    const tierTooLow = issues.filter((i) => i.issue === "tier-too-low");
    const notInPolar = issues.filter((i) => i.issue === "not-in-polar");

    // Build result
    const result: CompareResult = {
        comparedAt: new Date().toISOString(),
        summary: {
            totalApps: apps.length,
            appsWithGithubId: apps.length,
            appsWithoutGithubId: 0, // We only process apps with GitHub IDs
            issues: {
                "tier-too-low": tierTooLow.length,
                "not-in-polar": notInPolar.length,
                total: issues.length,
            },
            ok: okCount,
        },
        issues,
    };

    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write output
    writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));

    // Print console report
    console.log("=".repeat(60));
    console.log("APPS TIER COMPARISON SUMMARY");
    console.log("=".repeat(60));

    console.log(`\n📊 APPS.MD:`);
    console.log(`   Total apps with GitHub ID: ${result.summary.totalApps}`);
    console.log(`   Unique contributors: ${uniqueIds.length}`);

    console.log(`\n✅ OK (flower/nectar/router): ${result.summary.ok}`);

    console.log(`\n⚠️  ISSUES:`);
    console.log(
        `   └─ tier-too-low (spore/seed): ${result.summary.issues["tier-too-low"]}`,
    );

    if (tierTooLow.length > 0) {
        console.log(`\n📋 TIER-TOO-LOW BY CURRENT TIER:`);

        // Group tier-too-low by tier
        const byTier = new Map<string, TierIssue[]>();
        for (const issue of tierTooLow) {
            const tier = issue.tier || "null";
            if (!byTier.has(tier)) byTier.set(tier, []);
            const tierIssuesList = byTier.get(tier);
            if (tierIssuesList) tierIssuesList.push(issue);
        }

        for (const [tier, tierIssues] of byTier) {
            console.log(`\n   ${tier} (${tierIssues.length}):`);
            for (const issue of tierIssues.slice(0, 5)) {
                console.log(`     - ${issue.app} (@${issue.githubUsername})`);
            }
            if (tierIssues.length > 5) {
                console.log(`     ... and ${tierIssues.length - 5} more`);
            }
        }
    }

    if (notInPolar.length > 0) {
        console.log(`\n📋 NOT IN POLAR (${notInPolar.length} - skipped):`);
        console.log(`   These users don't have a Polar subscription yet.`);
    }

    console.log("\n" + "=".repeat(60));
    if (issues.length === 0) {
        console.log("✅ All app contributors have flower/nectar tier!");
    } else {
        console.log(`📄 Output: ${OUTPUT_PATH}`);
        console.log(
            `\n💡 These contributors should be upgraded to at least 'flower' tier.`,
        );
    }
}

main().catch(console.error);
