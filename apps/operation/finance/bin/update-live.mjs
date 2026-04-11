#!/usr/bin/env node
import { existsSync } from "node:fs";
/**
 * Daily cron entry point — pulls live MTD consumption from each configured
 * credit-pool provider, writes results into vendors.json and pool-history.json.
 *
 * Usage: node bin/update-live.mjs [--dry-run]
 *
 * What it does per provider:
 *   1. Call the provider wrapper (lib/providers/<name>.mjs).fetchMtd(currentMonth)
 *   2. Update vendors.json._pools[pool]:
 *        current_balance_usd = seed_balance - mtd_credit_usd
 *        (seed_balance stays in a separate field; current_balance_usd is derived)
 *        as_of = today
 *   3. Write pool-history.json: { <pool>: { "2026-04": -mtd_credit_usd, ... } }
 *      (overwrites the current-month entry on every run — this is fine because
 *      the month is still open; at month-end the value freezes)
 *
 * Providers without a wrapper are skipped silently. Missing CLI tooling fails
 * that single provider, not the whole script.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDORS_PATH = join(APP_DIR, "secrets", "vendors.json");
const HISTORY_PATH = join(APP_DIR, "secrets", "pool-history.json");

const DRY_RUN = process.argv.includes("--dry-run");

function currentMonth() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function loadJson(path, fallback) {
    if (!existsSync(path)) return fallback;
    return JSON.parse(await readFile(path, "utf8"));
}

async function saveJson(path, data) {
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function loadProviderModule(providerName) {
    try {
        const mod = await import(`../lib/providers/${providerName}.mjs`);
        return mod;
    } catch (e) {
        if (e.code === "ERR_MODULE_NOT_FOUND") return null;
        throw e;
    }
}

async function main() {
    const month = currentMonth();
    const vendors = await loadJson(VENDORS_PATH, {});
    const pools = vendors._pools ?? {};
    const history = await loadJson(HISTORY_PATH, {});

    if (Object.keys(pools).length === 0) {
        console.log(
            "No pools configured in vendors.json._pools. Nothing to do.",
        );
        return;
    }

    console.log(`Updating live MTD for ${month}${DRY_RUN ? " (dry run)" : ""}`);
    console.log();

    const summary = [];

    for (const [poolName, pool] of Object.entries(pools)) {
        const providerName = pool.provider;
        const mod = await loadProviderModule(providerName);
        if (!mod || typeof mod.fetchMtd !== "function") {
            console.log(
                `  ${poolName.padEnd(14)} - no provider wrapper (skipping)`,
            );
            summary.push({ poolName, status: "skipped" });
            continue;
        }

        try {
            const r = await mod.fetchMtd(month);
            const seedBalance =
                pool.seed_balance_usd ?? pool.current_balance_usd;
            const newBalance = Number(
                (seedBalance - r.mtd_credit_usd).toFixed(2),
            );

            // Preserve the seed so balance calculations stay stable across reruns.
            pool.seed_balance_usd = seedBalance;
            pool.current_balance_usd = newBalance;
            pool.as_of = r.as_of;
            pool.mtd_total_usd = r.mtd_total_usd;
            pool.mtd_credit_usd = r.mtd_credit_usd;
            pool.mtd_cash_usd = r.mtd_cash_usd;

            // Append to history (consumption is a negative number — credits drained)
            history[poolName] = history[poolName] ?? {};
            history[poolName][month] = -r.mtd_credit_usd;

            console.log(
                `  ${poolName.padEnd(14)} total=$${r.mtd_total_usd.toFixed(2)} credit=$${r.mtd_credit_usd.toFixed(2)} cash=$${r.mtd_cash_usd.toFixed(2)} records=${r.records}`,
            );
            console.log(
                `  ${" ".repeat(14)}   balance: $${seedBalance.toLocaleString()} → $${newBalance.toLocaleString()}`,
            );
            summary.push({ poolName, status: "ok", newBalance });
        } catch (e) {
            console.error(`  ${poolName.padEnd(14)} FAILED: ${e.message}`);
            summary.push({ poolName, status: "error", error: e.message });
        }
    }

    if (!DRY_RUN) {
        await saveJson(VENDORS_PATH, vendors);
        await saveJson(HISTORY_PATH, history);
        console.log();
        console.log("Wrote vendors.json and pool-history.json");
    } else {
        console.log();
        console.log("(dry run — nothing written)");
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
