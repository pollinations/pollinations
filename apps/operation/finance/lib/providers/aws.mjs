import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir } from "../io.mjs";

/**
 * AWS provider — same pattern as Azure.
 *
 *  - Credit balance: manual monthly seed (secrets/aws-credits.json). No decay,
 *    no live API for credits (AWS has no credits-listing endpoint).
 *  - Past months: come from Wise wires to Automat-IT via wise-transactions.mjs.
 *  - Current month column: also a Wise wire — the payment that hit this month
 *    settled last month's consumption (cash basis).
 *  - Next month column: this provider's mtd_cash_usd, sourced from Cost Explorer
 *    UnblendedCost MTD. The orchestrator (rebuild-sheet.mjs) injects it into
 *    nowMonth+1 because consumption now → Wise wire next month.
 *  - Months after that: forecast.mjs handles, with rule "none" for AWS
 *    counterparties so future columns stay blank.
 *
 * Credit-vs-cash split is intentionally NOT computed here. ~95% of the
 * Pollinations spend on this account is Claude via Marketplace which credits
 * don't absorb anyway, so pretending in real time produces wrong projections.
 * Credits-consumed-this-month falls out as (last anchor − this anchor) once
 * two months of seeds are recorded.
 *
 * Monthly refresh ritual:
 *   1. https://console.aws.amazon.com/billing/home?region=us-east-1#/credits
 *   2. Copy "Total amount remaining" → secrets/aws-credits.json balance_usd
 *   3. Bump as_of to today
 *
 * See .claude/skills/provider-billing/providers/aws.md for the full write-up.
 */

const CREDITS_PATH = join(appDir(), "secrets", "aws-credits.json");

function awsCmd(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("aws", args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
            stdout += d;
        });
        child.stderr.on("data", (d) => {
            stderr += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `aws ${args.join(" ")} failed (${code}): ${stderr}`,
                    ),
                );
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`aws returned invalid JSON: ${e.message}`));
            }
        });
    });
}

async function loadCreditsAnchor() {
    const raw = await readFile(CREDITS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.balance_usd !== "number" || !parsed.as_of) {
        throw new Error(
            `${CREDITS_PATH} must contain { as_of: "YYYY-MM-DD", balance_usd: <number> }`,
        );
    }
    return parsed;
}

function isoDate(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Sum daily UnblendedCost across a CE response window.
 * Exported for unit testing.
 */
export function sumMtdUnblended(days) {
    let total = 0;
    for (const day of days) {
        total += Number(day.Total?.UnblendedCost?.Amount ?? 0);
    }
    return Number(total.toFixed(2));
}

export async function fetchMtd(currentMonth, pool) {
    const anchor = await loadCreditsAnchor();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowIso = isoDate(tomorrow);
    const monthStart = `${currentMonth}-01`;

    // One $0.01 Cost Explorer call: daily UnblendedCost from the 1st of this
    // month through today (inclusive of partial day).
    const data = await awsCmd([
        "ce",
        "get-cost-and-usage",
        "--time-period",
        `Start=${monthStart},End=${tomorrowIso}`,
        "--granularity",
        "DAILY",
        "--metrics",
        "UnblendedCost",
    ]);

    const days = data.ResultsByTime ?? [];
    const mtdTotal = sumMtdUnblended(days);

    pool.current_balance_usd = anchor.balance_usd;
    pool.seed_balance_usd = anchor.balance_usd;
    pool.seed_as_of = anchor.as_of;

    return {
        mtd_total_usd: mtdTotal,
        mtd_credit_usd: 0,
        mtd_cash_usd: mtdTotal,
        current_balance_usd: anchor.balance_usd,
        records: days.length,
        as_of: isoDate(today),
        live_balance: true,
    };
}
