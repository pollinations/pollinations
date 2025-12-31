/**
 * Sync D1 pollen balances from Polar
 * 
 * This script fetches Polar meter balances for users and updates D1:
 * - tier_balance: from Polar "Usage (tier)" meter
 * - pack_balance: from Polar "Usage (pack)" meter
 * 
 * Rate limited to 100 requests/minute to Polar API.
 * 
 * Usage:
 *   # Dry run (default) - shows what would be updated
 *   sops exec-env secrets/prod.vars.json 'npx tsx scripts/sync-d1-balances.ts sync'
 *   
 *   # Apply changes
 *   sops exec-env secrets/prod.vars.json 'npx tsx scripts/sync-d1-balances.ts sync --apply'
 */

import { Polar } from "@polar-sh/sdk";
import { command, run, boolean, string } from "@drizzle-team/brocli";

const POLAR_RATE_LIMIT_DELAY_MS = 300; // ~200 requests/min to stay under 300/min limit

interface D1User {
    id: string;
    email: string;
    tier: string;
    tier_balance: number | null;
    pack_balance: number | null;
}

interface PolarBalances {
    tierBalance: number;
    packBalance: number;
}

interface SyncResult {
    userId: string;
    email: string;
    tier: string;
    d1TierBalance: number | null;
    d1PackBalance: number | null;
    polarTierBalance: number;
    polarPackBalance: number;
    action: "update" | "skip" | "error";
    reason: string;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchD1Users(): Promise<D1User[]> {
    // Use wrangler to query D1
    const { execSync } = await import("child_process");
    
    // Get users with paid tiers or existing balances
    const query = `
        SELECT id, email, tier, tier_balance, pack_balance 
        FROM user 
        WHERE tier IN ('seed', 'flower', 'nectar', 'router') 
           OR tier_balance IS NOT NULL
           OR pack_balance IS NOT NULL
        ORDER BY tier DESC
    `;
    
    const result = execSync(
        `npx wrangler d1 execute DB --remote --env production --json --command "${query.replace(/\n/g, " ")}"`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );
    
    const parsed = JSON.parse(result);
    return parsed[0]?.results || [];
}

async function updateD1Balances(userId: string, tierBalance: number, packBalance: number): Promise<void> {
    const { execSync } = await import("child_process");
    
    const query = `UPDATE user SET tier_balance = ${tierBalance}, pack_balance = ${packBalance} WHERE id = '${userId}'`;
    
    execSync(
        `npx wrangler d1 execute DB --remote --env production --command "${query}"`,
        { encoding: "utf-8" }
    );
}

async function getPolarBalances(polar: Polar, userId: string): Promise<PolarBalances | null> {
    try {
        const response = await polar.customerMeters.list({
            externalCustomerId: userId,
            limit: 100,
        });
        
        // Find tier and pack meters by name
        const tierMeter = response.result.items.find((m) =>
            m.meter.name.toLowerCase().includes("tier"),
        );
        const packMeter = response.result.items.find((m) =>
            m.meter.name.toLowerCase().includes("pack"),
        );
        
        return {
            tierBalance: tierMeter?.balance ?? 0,
            packBalance: packMeter?.balance ?? 0,
        };
    } catch (error: any) {
        if (error?.statusCode === 404 || error?.message?.includes("not found")) {
            return null; // User not in Polar
        }
        throw error;
    }
}

const syncCommand = command({
    name: "sync",
    desc: "Sync D1 tier_balance and pack_balance from Polar meters",
    options: {
        apply: boolean().default(false).desc("Actually apply changes (default: dry run)"),
        limit: string().default("0").desc("Limit number of users to process (0 = all)"),
    },
    handler: async (opts) => {
        const apply = opts.apply;
        const limit = parseInt(opts.limit, 10);
        
        console.log(`\n🔄 Syncing D1 balances from Polar (tier + pack)`);
        console.log(`   Mode: ${apply ? "APPLY" : "DRY RUN"}`);
        console.log(`   Limit: ${limit || "all"}\n`);
        
        if (!process.env.POLAR_ACCESS_TOKEN) {
            throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
        }
        
        const polar = new Polar({
            accessToken: process.env.POLAR_ACCESS_TOKEN,
            server: "production",
        });
        
        console.log("📊 Fetching users from D1...");
        let users = await fetchD1Users();
        console.log(`   Found ${users.length} users to check\n`);
        
        if (limit > 0) {
            users = users.slice(0, limit);
            console.log(`   Limited to ${users.length} users\n`);
        }
        
        const results: SyncResult[] = [];
        let processed = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        
        const startTime = Date.now();
        
        for (const user of users) {
            processed++;
            const progress = `[${processed}/${users.length}]`;
            
            try {
                // Rate limit
                if (processed > 1) {
                    await sleep(POLAR_RATE_LIMIT_DELAY_MS);
                }
                
                const polarBalances = await getPolarBalances(polar, user.id);
                
                if (polarBalances === null) {
                    // User not in Polar
                    results.push({
                        userId: user.id,
                        email: user.email,
                        tier: user.tier,
                        d1TierBalance: user.tier_balance,
                        d1PackBalance: user.pack_balance,
                        polarTierBalance: 0,
                        polarPackBalance: 0,
                        action: "skip",
                        reason: "Not in Polar",
                    });
                    skipped++;
                    console.log(`${progress} ⏭️  ${user.email} - Not in Polar`);
                    continue;
                }
                
                const d1Tier = user.tier_balance ?? 0;
                const d1Pack = user.pack_balance ?? 0;
                const needsUpdate = 
                    user.tier_balance === null || 
                    user.pack_balance === null ||
                    Math.abs(d1Tier - polarBalances.tierBalance) > 0.01 ||
                    Math.abs(d1Pack - polarBalances.packBalance) > 0.01;
                
                if (needsUpdate) {
                    if (apply) {
                        await updateD1Balances(user.id, polarBalances.tierBalance, polarBalances.packBalance);
                        console.log(`${progress} ✅ ${user.email} - Updated: tier ${d1Tier}→${polarBalances.tierBalance}, pack ${d1Pack}→${polarBalances.packBalance}`);
                    } else {
                        console.log(`${progress} 📝 ${user.email} - Would update: tier ${d1Tier}→${polarBalances.tierBalance}, pack ${d1Pack}→${polarBalances.packBalance}`);
                    }
                    
                    results.push({
                        userId: user.id,
                        email: user.email,
                        tier: user.tier,
                        d1TierBalance: user.tier_balance,
                        d1PackBalance: user.pack_balance,
                        polarTierBalance: polarBalances.tierBalance,
                        polarPackBalance: polarBalances.packBalance,
                        action: "update",
                        reason: "Sync from Polar",
                    });
                    updated++;
                } else {
                    results.push({
                        userId: user.id,
                        email: user.email,
                        tier: user.tier,
                        d1TierBalance: user.tier_balance,
                        d1PackBalance: user.pack_balance,
                        polarTierBalance: polarBalances.tierBalance,
                        polarPackBalance: polarBalances.packBalance,
                        action: "skip",
                        reason: "Already in sync",
                    });
                    skipped++;
                    console.log(`${progress} ⏭️  ${user.email} - OK (tier: ${d1Tier}, pack: ${d1Pack})`);
                }
            } catch (error: any) {
                results.push({
                    userId: user.id,
                    email: user.email,
                    tier: user.tier,
                    d1TierBalance: user.tier_balance,
                    d1PackBalance: user.pack_balance,
                    polarTierBalance: 0,
                    polarPackBalance: 0,
                    action: "error",
                    reason: error.message || String(error),
                });
                errors++;
                console.log(`${progress} ❌ ${user.email} - Error: ${error.message}`);
            }
        }
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`\n${"=".repeat(60)}`);
        console.log(`📊 Summary`);
        console.log(`${"=".repeat(60)}`);
        console.log(`   Total processed: ${processed}`);
        console.log(`   ${apply ? "Updated" : "Would update"}: ${updated}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   Time: ${elapsed}s`);
        console.log(`${"=".repeat(60)}\n`);
        
        if (!apply && updated > 0) {
            console.log(`💡 Run with --apply to actually update ${updated} users\n`);
        }
        
        // Show users that need updates
        const needsUpdate = results.filter((r) => r.action === "update");
        if (needsUpdate.length > 0) {
            console.log(`\n📋 Users ${apply ? "updated" : "needing update"}:`);
            for (const r of needsUpdate) {
                console.log(`   ${r.email} (${r.tier}): tier ${r.d1TierBalance ?? "NULL"}→${r.polarTierBalance}, pack ${r.d1PackBalance ?? "NULL"}→${r.polarPackBalance}`);
            }
        }
    },
});

run([syncCommand]);
