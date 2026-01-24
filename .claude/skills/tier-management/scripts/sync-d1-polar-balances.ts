#!/usr/bin/env npx tsx
/**
 * Sync D1 user balances with Polar
 * Rate limited to 1 user per second to avoid Polar API rate limits
 * Applies fixes directly to D1 database
 *
 * Usage:
 *   cd enter.pollinations.ai
 *   export POLAR_ACCESS_TOKEN=...
 *
 *   # Sync users with negative pack_balance:
 *   npx wrangler d1 execute production-pollinations-enter-db --remote --json \
 *     --command "SELECT id, email, tier_balance, pack_balance FROM user WHERE pack_balance < 0" \
 *     | npx tsx ../.claude/skills/tier-management/scripts/sync-d1-polar-balances.ts
 *
 *   # Sync all users (be careful, this is slow):
 *   npx wrangler d1 execute production-pollinations-enter-db --remote --json \
 *     --command "SELECT id, email, tier_balance, pack_balance FROM user" \
 *     | npx tsx ../.claude/skills/tier-management/scripts/sync-d1-polar-balances.ts
 */

import { Polar } from "@polar-sh/sdk";
import { execSync } from "child_process";

const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
if (!POLAR_ACCESS_TOKEN) {
    console.error("POLAR_ACCESS_TOKEN environment variable is required");
    process.exit(1);
}

const polar = new Polar({
    accessToken: POLAR_ACCESS_TOKEN,
    server: "production",
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function applyFixToD1(
    userId: string,
    tierBalance: number,
    packBalance: number,
): boolean {
    const sql = `UPDATE user SET tier_balance = ${tierBalance}, pack_balance = ${packBalance} WHERE id = '${userId}'`;
    try {
        execSync(
            `npx wrangler d1 execute production-pollinations-enter-db --remote --command "${sql}"`,
            { stdio: "pipe", cwd: process.cwd() },
        );
        return true;
    } catch (error: any) {
        console.error(`  ❌ Failed to apply fix: ${error?.message}`);
        return false;
    }
}

async function getPolarBalances(
    email: string,
): Promise<{ tier: number; pack: number } | null> {
    try {
        const customerResponse = await polar.customers.list({
            email,
            limit: 1,
        });

        const customer = customerResponse.result.items[0];
        if (!customer) {
            return null;
        }

        await sleep(500); // Small delay between requests

        const metersResponse = await polar.customerMeters.list({
            customerId: customer.id,
            limit: 100,
        });

        let tierBalance = 0;
        let packBalance = 0;

        for (const meter of metersResponse.result.items) {
            const slug = (meter.meter.metadata as any)?.slug;
            if (slug === "v1:meter:tier") {
                tierBalance = meter.balance;
            } else if (slug === "v1:meter:pack") {
                packBalance = meter.balance;
            }
        }

        return { tier: tierBalance, pack: packBalance };
    } catch (error: any) {
        if (error?.statusCode === 429) {
            console.error(
                `\n❌ RATE LIMITED! Exiting so you can check what's going on.`,
            );
            console.error(`   Wait ~60 seconds before retrying.`);
            process.exit(1);
        }
        console.error(`  Error: ${error?.message || error}`);
        return null;
    }
}

async function main() {
    // Read stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf-8");

    // Parse D1 JSON output
    const parsed = JSON.parse(input);
    const users = parsed[0]?.results || parsed;

    console.log(`Found ${users.length} users to sync`);
    console.log(`Will apply fixes directly to D1`);
    console.log("");

    let processed = 0;
    let skipped = 0;
    let fixed = 0;
    let failed = 0;

    for (const user of users) {
        processed++;

        // Rate limit: 1 user per second
        if (processed > 1) {
            await sleep(1000);
        }

        console.log(`[${processed}/${users.length}] ${user.email}`);
        console.log(
            `  D1: tier=${user.tier_balance}, pack=${user.pack_balance}`,
        );

        const polarBalances = await getPolarBalances(user.email);

        if (!polarBalances) {
            console.log(`  ⚠️  Not found in Polar, skipping`);
            skipped++;
            continue;
        }

        console.log(
            `  Polar: tier=${polarBalances.tier}, pack=${polarBalances.pack}`,
        );

        // Apply fix directly to D1
        const success = applyFixToD1(
            user.id,
            polarBalances.tier,
            polarBalances.pack,
        );
        if (success) {
            fixed++;
            console.log(`  ✅ Fixed!`);
        } else {
            failed++;
        }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log(`Processed: ${processed}`);
    console.log(`Skipped (not in Polar): ${skipped}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Failed: ${failed}`);
    console.log("=".repeat(60));
}

main().catch(console.error);
