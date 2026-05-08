import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir } from "../io.mjs";

/**
 * AWS provider — fetches MTD consumption from Cost Explorer + reads a manual
 * credit anchor from secrets/aws-credits.json to derive remaining balance.
 *
 * AWS exposes credits in the Billing Console UI but does NOT surface them via
 * `aws ce get-cost-and-usage` (no `Credit` row in the RECORD_TYPE grouping
 * even when credits are clearly absorbing usage). To work around this, the
 * operator re-anchors the seed manually on a monthly cadence:
 *
 *   1. Open https://console.aws.amazon.com/billing/home?region=us-east-1#/credits
 *   2. Copy the "Total amount remaining" number into secrets/aws-credits.json
 *   3. Bump as_of to today
 *
 * Between re-anchors we sum daily UnblendedCost since as_of and treat 100% of
 * it as credit burn while the seed is positive (matches reality — credits
 * absorb essentially all usage on this account).
 *
 * See .claude/skills/provider-billing/providers/aws.md for the deeper write-up.
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
 * Pure helper: derive balance + MTD split from the CE daily payload.
 * Exported for unit testing; consumed by fetchMtd below.
 */
export function computeAwsBalance({ anchor, days, currentMonth }) {
    const monthPrefix = `${currentMonth}-`;
    let burnSinceAnchor = 0;
    let mtdUnblended = 0;
    for (const day of days) {
        const amount = Number(day.Total?.UnblendedCost?.Amount ?? 0);
        burnSinceAnchor += amount;
        if (day.TimePeriod?.Start?.startsWith(monthPrefix)) {
            mtdUnblended += amount;
        }
    }
    const currentBalance = Math.max(
        0,
        Number((anchor.balance_usd - burnSinceAnchor).toFixed(2)),
    );
    const mtd_total_usd = Number(mtdUnblended.toFixed(2));
    // While the credit seed is positive, treat 100% of usage as credit burn.
    // After it exhausts, spend lands as cash (will hit Wise next month).
    const mtd_credit_usd = currentBalance > 0 ? mtd_total_usd : 0;
    const mtd_cash_usd = currentBalance > 0 ? 0 : mtd_total_usd;
    return {
        currentBalance,
        mtd_total_usd,
        mtd_credit_usd,
        mtd_cash_usd,
        records: days.length,
    };
}

/**
 * Fetch MTD usage and derive remaining credit balance.
 *
 * Mutates `pool.current_balance_usd` and returns `live_balance: true` so the
 * orchestrator trusts the wrapper's number instead of recomputing from seed.
 */
export async function fetchMtd(currentMonth, pool) {
    const anchor = await loadCreditsAnchor();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowIso = isoDate(tomorrow);

    // Single CE call: daily granularity from anchor → tomorrow (inclusive of today's
    // partial). Lets us derive both MTD (this month's days) and total burn since
    // anchor in one $0.01 request.
    const data = await awsCmd([
        "ce",
        "get-cost-and-usage",
        "--time-period",
        `Start=${anchor.as_of},End=${tomorrowIso}`,
        "--granularity",
        "DAILY",
        "--metrics",
        "UnblendedCost",
    ]);

    const result = computeAwsBalance({
        anchor,
        days: data.ResultsByTime ?? [],
        currentMonth,
    });

    pool.current_balance_usd = result.currentBalance;
    pool.seed_balance_usd = anchor.balance_usd;
    pool.seed_as_of = anchor.as_of;

    return {
        mtd_total_usd: result.mtd_total_usd,
        mtd_credit_usd: result.mtd_credit_usd,
        mtd_cash_usd: result.mtd_cash_usd,
        current_balance_usd: result.currentBalance,
        records: result.records,
        as_of: isoDate(today),
        live_balance: true,
    };
}
