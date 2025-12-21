#!/usr/bin/env npx tsx
/**
 * Manage Polar subscription issues.
 *
 * Usage:
 *   npx tsx scripts/manage-subscriptions.ts analyze               # Interactive: analyze, report, ask to fix
 *   npx tsx scripts/manage-subscriptions.ts detect list           # List customers without subscriptions
 *   npx tsx scripts/manage-subscriptions.ts detect summary        # Show summary of issues
 *   npx tsx scripts/manage-subscriptions.ts fix subscriptions     # Fix missing subscriptions (dry-run)
 *   npx tsx scripts/manage-subscriptions.ts fix subscriptions --apply  # Actually apply fixes
 *
 * Requires:
 *   - POLAR_ACCESS_TOKEN environment variable
 *   - wrangler configured for D1 access
 */

import { Polar } from "@polar-sh/sdk";
import { command, run, boolean, string } from "@drizzle-team/brocli";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";

const execAsync = promisify(exec);

// Tier definitions matching manage-polar.ts
const TIERS = ["spore", "seed", "flower", "nectar"] as const;
type TierName = (typeof TIERS)[number];

function isValidTier(tier: string): tier is TierName {
    return TIERS.includes(tier as TierName);
}

// Product slug format
function tierProductSlug(tier: TierName): string {
    return `v1:product:tier:${tier}`;
}

// Polar client setup
function getPolarAccessToken(): string {
    const token = process.env.POLAR_ACCESS_TOKEN;
    if (!token) {
        throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
    }
    return token;
}

function createPolarClient(): Polar {
    return new Polar({
        accessToken: getPolarAccessToken(),
        server: "production",
    });
}

// D1 query helper
interface D1User {
    id: string;
    email: string;
    tier: string;
}

async function queryD1Users(): Promise<Map<string, D1User>> {
    console.log("  Querying D1 for all users...");
    try {
        const { stdout, stderr } = await execAsync(
            `npx wrangler d1 execute DB --remote --env production --command "SELECT id, email, tier FROM user" --json 2>/dev/null`,
        );
        const result = JSON.parse(stdout);
        const users = result[0]?.results as D1User[] || [];
        
        // Create map by both id and email for lookup
        const userMap = new Map<string, D1User>();
        for (const user of users) {
            userMap.set(user.id, user);
            userMap.set(user.email.toLowerCase(), user);
        }
        console.log(`  Found ${users.length} users in D1`);
        return userMap;
    } catch (error: any) {
        console.error("  D1 query failed:", error.message);
        throw error;
    }
}

// Product map helper
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

// Customer types
interface CustomerIssue {
    polarId: string;
    email: string;
    name: string | null;
    externalId: string | null;
    hasSubscription: boolean;
    d1Tier: TierName | null;
    issueType: "no_subscription" | "no_external_id" | "orphan";
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 5): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const is429 = error.message?.includes("429");
            if (is429 && attempt < maxRetries) {
                const delay = attempt * 3000; // 3s, 6s, 9s, etc.
                console.log(`  Rate limited (${label}), waiting ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Max retries exceeded for ${label}`);
}

async function detectIssues(polar: Polar): Promise<CustomerIssue[]> {
    const issues: CustomerIssue[] = [];
    
    // Get D1 users
    const d1Users = await queryD1Users();
    
    // Get customers with active subscriptions
    console.log("  Fetching Polar subscriptions...");
    const customersWithSub = new Set<string>();
    const subPaginator = await withRetry(
        () => polar.subscriptions.list({ active: true, limit: 100 }),
        "subscriptions.list"
    );
    for await (const page of subPaginator) {
        for (const sub of page.result.items) {
            customersWithSub.add(sub.customer.id);
        }
        await sleep(300); // Rate limit protection
    }
    console.log(`  Found ${customersWithSub.size} customers with subscriptions`);
    
    // Get all customers and find issues
    console.log("  Fetching Polar customers...");
    await sleep(2000); // Wait before next API call
    const customerPaginator = await withRetry(
        () => polar.customers.list({ limit: 100 }),
        "customers.list"
    );
    let totalCustomers = 0;
    
    for await (const page of customerPaginator) {
        for (const customer of page.result.items) {
            totalCustomers++;
            if (customer.deletedAt) continue;
            
            const hasSub = customersWithSub.has(customer.id);
            if (hasSub) continue; // No issue
            
            // Look up D1 user by externalId or email
            let d1User: D1User | undefined;
            if (customer.externalId) {
                d1User = d1Users.get(customer.externalId);
            }
            if (!d1User) {
                d1User = d1Users.get(customer.email.toLowerCase());
            }
            
            let issueType: CustomerIssue["issueType"];
            if (customer.externalId && d1User) {
                issueType = "no_subscription";
            } else if (!customer.externalId && d1User) {
                issueType = "no_external_id";
            } else {
                issueType = "orphan";
            }
            
            issues.push({
                polarId: customer.id,
                email: customer.email,
                name: customer.name || null,
                externalId: customer.externalId || null,
                hasSubscription: false,
                d1Tier: d1User && isValidTier(d1User.tier) ? d1User.tier : null,
                issueType,
            });
        }
        await sleep(150); // Rate limit protection
    }
    
    console.log(`  Total customers: ${totalCustomers}`);
    return issues;
}

// ============ DETECT COMMANDS ============

const detectList = command({
    name: "list",
    options: {
        type: boolean().desc("Filter by issue type").default(false),
    },
    handler: async () => {
        const polar = createPolarClient();
        console.log("Detecting subscription issues...\n");
        
        const issues = await detectIssues(polar);
        
        console.log("\n=== Customers Without Subscriptions ===\n");
        
        const noSub = issues.filter((i) => i.issueType === "no_subscription");
        const noExtId = issues.filter((i) => i.issueType === "no_external_id");
        const orphans = issues.filter((i) => i.issueType === "orphan");
        
        if (noSub.length > 0) {
            console.log(`\n--- Has externalId, missing subscription (${noSub.length}) ---`);
            for (const c of noSub) {
                console.log(`  ${c.email} | tier: ${c.d1Tier || "unknown"}`);
            }
        }
        
        if (noExtId.length > 0) {
            console.log(`\n--- No externalId, but email in D1 (${noExtId.length}) ---`);
            for (const c of noExtId) {
                console.log(`  ${c.email} | tier: ${c.d1Tier || "unknown"}`);
            }
        }
        
        if (orphans.length > 0) {
            console.log(`\n--- Orphans - no D1 match (${orphans.length}) ---`);
            for (const c of orphans) {
                console.log(`  ${c.email}`);
            }
        }
    },
});

const detectSummary = command({
    name: "summary",
    handler: async () => {
        const polar = createPolarClient();
        console.log("Detecting subscription issues...\n");
        
        const issues = await detectIssues(polar);
        
        const noSub = issues.filter((i) => i.issueType === "no_subscription");
        const noExtId = issues.filter((i) => i.issueType === "no_external_id");
        const orphans = issues.filter((i) => i.issueType === "orphan");
        
        // Count tiers for fixable issues
        const tierCounts: Record<string, number> = {};
        for (const issue of [...noSub, ...noExtId]) {
            const tier = issue.d1Tier || "unknown";
            tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        }
        
        console.log("\n=== SUBSCRIPTION ISSUES SUMMARY ===\n");
        console.log(`Total issues: ${issues.length}`);
        console.log("");
        console.log("By issue type:");
        console.log(`  ✅ Has externalId, no subscription: ${noSub.length} (easy fix)`);
        console.log(`  ⚠️  No externalId, email in D1:     ${noExtId.length} (needs linking)`);
        console.log(`  ❌ Orphans (no D1 match):           ${orphans.length} (manual)`);
        console.log("");
        console.log("Fixable issues by D1 tier:");
        for (const [tier, count] of Object.entries(tierCounts).sort()) {
            console.log(`  ${tier}: ${count}`);
        }
    },
});

// ============ FIX COMMANDS ============

const fixSubscriptions = command({
    name: "subscriptions",
    options: {
        apply: boolean().desc("Actually apply changes (default: dry-run)").default(false),
    },
    handler: async (opts) => {
        const polar = createPolarClient();
        const isDryRun = !opts.apply;
        
        console.log(isDryRun ? "👀 DRY RUN - No changes will be made\n" : "🔧 APPLY MODE - Changes will be made!\n");
        
        // Get product map
        console.log("Loading tier products...");
        const productMap = await getTierProductMap(polar);
        console.log(`  Found ${productMap.size} tier products`);
        
        // Detect issues
        console.log("\nDetecting issues...");
        const issues = await detectIssues(polar);
        
        // Filter to fixable issues (has externalId)
        const fixable = issues.filter((i) => i.issueType === "no_subscription" && i.d1Tier);
        
        console.log(`\nFixable customers: ${fixable.length}`);
        if (fixable.length === 0) {
            console.log("✅ No customers need fixing!");
            return;
        }
        
        // Process fixes
        let success = 0;
        let failed = 0;
        let skipped = 0;
        
        for (const customer of fixable) {
            const tier = customer.d1Tier!;
            const slug = tierProductSlug(tier);
            const product = productMap.get(slug);
            
            if (!product) {
                console.log(`⚠️  ${customer.email} - No product for tier: ${tier}`);
                skipped++;
                continue;
            }
            
            const line = `${customer.email} → ${tier} (${product.name})`;
            
            if (isDryRun) {
                console.log(`  Would subscribe: ${line}`);
                success++;
            } else {
                try {
                    await polar.subscriptions.create({
                        productId: product.id,
                        customerId: customer.polarId,
                    });
                    console.log(`✅ ${line}`);
                    success++;
                } catch (error: any) {
                    console.log(`❌ ${line} - Error: ${error.message}`);
                    failed++;
                }
            }
        }
        
        console.log("\n=== Summary ===");
        console.log(`Total fixable: ${fixable.length}`);
        if (isDryRun) {
            console.log(`Would fix: ${success}`);
            console.log(`Would skip: ${skipped}`);
            console.log("\nRun with --apply to make changes.");
        } else {
            console.log(`Success: ${success}`);
            console.log(`Failed: ${failed}`);
            console.log(`Skipped: ${skipped}`);
        }
    },
});

const fixExternalIds = command({
    name: "external-ids",
    options: {
        apply: boolean().desc("Actually apply changes (default: dry-run)").default(false),
    },
    handler: async (opts) => {
        const polar = createPolarClient();
        const isDryRun = !opts.apply;
        
        console.log(isDryRun ? "👀 DRY RUN - No changes will be made\n" : "🔧 APPLY MODE - Changes will be made!\n");
        
        // Get D1 users for ID lookup
        const d1Users = await queryD1Users();
        
        // Detect issues
        console.log("\nDetecting issues...");
        const issues = await detectIssues(polar);
        
        // Filter to linkable issues
        const linkable = issues.filter((i) => i.issueType === "no_external_id");
        
        console.log(`\nLinkable customers: ${linkable.length}`);
        if (linkable.length === 0) {
            console.log("✅ No customers need linking!");
            return;
        }
        
        let success = 0;
        let failed = 0;
        
        for (const customer of linkable) {
            const d1User = d1Users.get(customer.email.toLowerCase());
            if (!d1User) {
                console.log(`⚠️  ${customer.email} - D1 user not found`);
                failed++;
                continue;
            }
            
            const line = `${customer.email} → externalId: ${d1User.id}`;
            
            if (isDryRun) {
                console.log(`  Would link: ${line}`);
                success++;
            } else {
                try {
                    await polar.customers.update({
                        id: customer.polarId,
                        customerUpdate: {
                            externalId: d1User.id,
                        },
                    });
                    console.log(`✅ ${line}`);
                    success++;
                } catch (error: any) {
                    console.log(`❌ ${line} - Error: ${error.message}`);
                    failed++;
                }
            }
        }
        
        console.log("\n=== Summary ===");
        console.log(`Total linkable: ${linkable.length}`);
        if (isDryRun) {
            console.log(`Would link: ${success}`);
            console.log("\nRun with --apply to make changes.");
        } else {
            console.log(`Success: ${success}`);
            console.log(`Failed: ${failed}`);
        }
    },
});

// ============ REPORT GENERATION ============

function generateMarkdownReport(issues: CustomerIssue[], productMap: ProductMap): string {
    const now = new Date().toISOString().split("T")[0];
    const noSub = issues.filter((i) => i.issueType === "no_subscription");
    const noExtId = issues.filter((i) => i.issueType === "no_external_id");
    const orphans = issues.filter((i) => i.issueType === "orphan");
    
    // Count by tier
    const tierCounts: Record<string, number> = {};
    for (const issue of [...noSub, ...noExtId]) {
        const tier = issue.d1Tier || "unknown";
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    }
    
    let md = `# Polar Subscription Issues Report

**Generated:** ${now}

## Summary

| Category | Count |
|----------|-------|
| **Total customers without subscription** | ${issues.length} |
| ├─ With externalId (easy fix) | ${noSub.length} |
| └─ Without externalId | ${noExtId.length + orphans.length} |
| &nbsp;&nbsp;&nbsp;&nbsp;├─ Linkable (email matches D1) | ${noExtId.length} |
| &nbsp;&nbsp;&nbsp;&nbsp;└─ Orphans (no D1 match) | ${orphans.length} |

## Tier Distribution (fixable)

| Tier | Count |
|------|-------|
`;
    for (const [tier, count] of Object.entries(tierCounts).sort()) {
        const emoji = tier === "spore" ? "🦠" : tier === "seed" ? "🌱" : tier === "flower" ? "🌸" : tier === "nectar" ? "🍯" : "❓";
        md += `| ${emoji} ${tier} | ${count} |\n`;
    }

    md += `
---

## 1. ✅ Easy Fix: Has externalId, missing subscription (${noSub.length})

These customers are properly linked to D1 but don't have an active subscription.

| Email | D1 Tier | Product |
|-------|---------|---------|
`;
    for (const c of noSub.slice(0, 50)) {
        const product = c.d1Tier ? productMap.get(tierProductSlug(c.d1Tier)) : null;
        md += `| ${c.email} | ${c.d1Tier || "unknown"} | ${product?.name || "N/A"} |\n`;
    }
    if (noSub.length > 50) {
        md += `| ... and ${noSub.length - 50} more | | |\n`;
    }

    md += `
---

## 2. ⚠️ Needs Linking: No externalId but email in D1 (${noExtId.length})

| Email | D1 Tier |
|-------|---------|
`;
    for (const c of noExtId) {
        md += `| ${c.email} | ${c.d1Tier || "unknown"} |\n`;
    }

    md += `
---

## 3. ❌ Orphans: No D1 match (${orphans.length})

| Email |
|-------|
`;
    for (const c of orphans) {
        md += `| ${c.email} |\n`;
    }

    return md;
}

async function promptUser(question: string): Promise<boolean> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer: string) => {
            rl.close();
            resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
        });
    });
}

async function applyFixes(
    polar: Polar,
    issues: CustomerIssue[],
    productMap: ProductMap,
): Promise<{ success: number; failed: number; errors: string[] }> {
    const fixable = issues.filter((i) => i.issueType === "no_subscription" && i.d1Tier);
    const errors: string[] = [];
    let success = 0;
    let failed = 0;
    
    console.log(`Processing ${fixable.length} customers with rate limiting...\n`);
    
    for (let i = 0; i < fixable.length; i++) {
        const customer = fixable[i];
        const tier = customer.d1Tier!;
        const slug = tierProductSlug(tier);
        const product = productMap.get(slug);
        
        if (!product) {
            errors.push(`${customer.email}: No product for tier ${tier}`);
            failed++;
            continue;
        }
        
        // Retry with exponential backoff
        let lastError: string | undefined;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await polar.subscriptions.create({
                    productId: product.id,
                    customerId: customer.polarId,
                });
                console.log(`✅ [${i + 1}/${fixable.length}] ${customer.email} → ${tier}`);
                success++;
                lastError = undefined;
                break;
            } catch (error: any) {
                lastError = error.message;
                const is429 = error.message?.includes("429");
                if (is429 && attempt < 5) {
                    const delay = attempt * 2000; // 2s, 4s, 6s, 8s
                    console.log(`  ⏳ Rate limited, waiting ${delay / 1000}s (attempt ${attempt}/5)...`);
                    await sleep(delay);
                    continue;
                }
                break;
            }
        }
        
        if (lastError) {
            const msg = `${customer.email}: ${lastError}`;
            errors.push(msg);
            console.log(`❌ [${i + 1}/${fixable.length}] ${msg}`);
            failed++;
        }
        
        // Rate limit: 500ms delay between successful requests
        await sleep(500);
    }
    
    return { success, failed, errors };
}

// ============ INTERACTIVE RUN COMMAND ============

const runAnalysis = command({
    name: "analyze",
    options: {
        output: string().desc("Output markdown file path").default("scripts/subscription-report.md"),
    },
    handler: async (opts) => {
        const polar = createPolarClient();
        
        console.log("🔍 Analyzing Polar subscription issues...\n");
        
        // Get product map
        console.log("Loading tier products...");
        const productMap = await getTierProductMap(polar);
        
        // Detect issues
        console.log("\nDetecting issues...");
        const issues = await detectIssues(polar);
        
        const noSub = issues.filter((i) => i.issueType === "no_subscription");
        const noExtId = issues.filter((i) => i.issueType === "no_external_id");
        const orphans = issues.filter((i) => i.issueType === "orphan");
        
        // Generate report
        console.log("\nGenerating report...");
        const markdown = generateMarkdownReport(issues, productMap);
        await writeFile(opts.output, markdown);
        console.log(`📄 Report saved to: ${opts.output}`);
        
        // Display summary
        console.log("\n" + "=".repeat(50));
        console.log("📊 SUBSCRIPTION ISSUES SUMMARY");
        console.log("=".repeat(50));
        console.log(`\nTotal issues: ${issues.length}`);
        console.log(`  ✅ With externalId (fixable):     ${noSub.length}`);
        console.log(`  ⚠️  No externalId (needs linking): ${noExtId.length}`);
        console.log(`  ❌ Orphans (manual):               ${orphans.length}`);
        
        // Tier breakdown
        const tierCounts: Record<string, number> = {};
        for (const issue of noSub) {
            const tier = issue.d1Tier || "unknown";
            tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        }
        console.log("\nFixable by tier:");
        for (const [tier, count] of Object.entries(tierCounts).sort()) {
            console.log(`  ${tier}: ${count}`);
        }
        
        if (noSub.length === 0) {
            console.log("\n✅ No fixable issues found!");
            return;
        }
        
        // Ask user if they want to apply
        console.log("\n" + "=".repeat(50));
        const shouldFix = await promptUser(`\n🔧 Apply fixes for ${noSub.length} customers? (y/N): `);
        
        if (shouldFix) {
            console.log("\nApplying fixes...\n");
            const result = await applyFixes(polar, issues, productMap);
            
            console.log("\n" + "=".repeat(50));
            console.log("📋 RESULTS");
            console.log("=".repeat(50));
            console.log(`Success: ${result.success}`);
            console.log(`Failed: ${result.failed}`);
            
            if (result.errors.length > 0) {
                console.log("\nErrors:");
                for (const err of result.errors) {
                    console.log(`  ❌ ${err}`);
                }
            }
        } else {
            console.log("\n⏭️  Skipped. Run again when ready to apply fixes.");
        }
    },
});

// ============ COMMAND STRUCTURE ============

const deleteOrphans = command({
    name: "orphans",
    options: {
        apply: boolean().desc("Actually delete (default: dry-run)").default(false),
    },
    handler: async (opts) => {
        const polar = createPolarClient();
        const isDryRun = !opts.apply;
        
        console.log(isDryRun ? "👀 DRY RUN - No changes will be made\n" : "🗑️  DELETE MODE - Orphans will be deleted!\n");
        
        console.log("Detecting issues...");
        const issues = await detectIssues(polar);
        const orphans = issues.filter((i) => i.issueType === "orphan");
        
        console.log(`\nOrphan customers: ${orphans.length}`);
        if (orphans.length === 0) {
            console.log("✅ No orphans found!");
            return;
        }
        
        for (const orphan of orphans) {
            console.log(`  - ${orphan.email} (${orphan.polarId})`);
        }
        
        if (isDryRun) {
            console.log("\nRun with --apply to delete these customers.");
            return;
        }
        
        let success = 0;
        let failed = 0;
        
        for (const orphan of orphans) {
            try {
                await polar.customers.delete({ id: orphan.polarId });
                console.log(`✅ Deleted: ${orphan.email}`);
                success++;
                await sleep(500);
            } catch (error: any) {
                console.log(`❌ Failed to delete ${orphan.email}: ${error.message}`);
                failed++;
            }
        }
        
        console.log("\n=== Summary ===");
        console.log(`Deleted: ${success}`);
        console.log(`Failed: ${failed}`);
    },
});

const commands = [
    command({
        name: "detect",
        subcommands: [detectList, detectSummary],
    }),
    command({
        name: "fix",
        subcommands: [fixSubscriptions, fixExternalIds],
    }),
    command({
        name: "delete",
        subcommands: [deleteOrphans],
    }),
    runAnalysis,
];

run(commands);
