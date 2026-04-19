#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
/**
 * Daily cron entry point — pulls live MTD consumption from each configured
 * credit-pool provider, writes results into vendors.json and pool-history.json,
 * then runs rebuild-sheet.mjs to push the fresh numbers to Google Sheets.
 *
 * Usage: node bin/update-live.mjs [--dry-run] [--no-rebuild]
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
import { loadDotenv } from "../lib/io.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDORS_PATH = join(APP_DIR, "secrets", "vendors.json");
const HISTORY_PATH = join(APP_DIR, "secrets", "pool-history.json");

const DRY_RUN = process.argv.includes("--dry-run");
const NO_REBUILD = process.argv.includes("--no-rebuild");

function runRebuild() {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "node",
            [join(APP_DIR, "bin", "rebuild-sheet.mjs")],
            { stdio: "inherit" },
        );
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`rebuild-sheet.mjs exited ${code}`));
                return;
            }
            resolve();
        });
    });
}

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
    // Load secrets (RUNPOD_API_KEY, LAMBDA_LABS_API_KEY, etc.) from
    // apps/operation/finance/secrets/.env into process.env.
    await loadDotenv();

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
            // Capture the balance the wrapper sees BEFORE calling it, so we
            // can detect whether the wrapper set current_balance_usd itself
            // (live API) or left it untouched (API reports MTD only, we derive).
            const priorBalance = pool.current_balance_usd;
            const r = await mod.fetchMtd(month, pool);

            let newBalance;
            if (pool.kind === "payg" || pool.role === "revenue") {
                // Pay-as-you-go and revenue pools (e.g. Alibaba, Stripe) have
                // no standing balance. Skip balance tracking entirely.
                newBalance = null;
            } else if (
                r.live_balance ||
                pool.current_balance_usd !== priorBalance
            ) {
                // Wrapper set current_balance_usd directly from a live API call.
                // Trust the wrapper; don't recompute from seed.
                newBalance = pool.current_balance_usd;
            } else {
                // Wrapper only returned MTD; derive balance from seed - mtd_credit.
                const seedBalance =
                    pool.seed_balance_usd ?? pool.current_balance_usd;
                pool.seed_balance_usd = seedBalance;
                newBalance = Number(
                    (seedBalance - r.mtd_credit_usd).toFixed(2),
                );
                pool.current_balance_usd = newBalance;
            }

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
            if (newBalance === null) {
                const kind = pool.role === "revenue" ? "revenue" : "payg";
                console.log(
                    `  ${" ".repeat(14)}   (${kind} — no balance tracked)`,
                );
            } else {
                console.log(
                    `  ${" ".repeat(14)}   balance: $${(priorBalance ?? 0).toLocaleString()} → $${newBalance.toLocaleString()}`,
                );
            }
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

    if (!DRY_RUN && !NO_REBUILD) {
        console.log();
        console.log("Running rebuild-sheet.mjs...");
        await runRebuild();
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
