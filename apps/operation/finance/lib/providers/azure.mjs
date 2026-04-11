import { spawn } from "node:child_process";

/**
 * Azure provider — fetches MTD consumption from Azure Consumption API via `az rest`.
 *
 * Returns { mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of }.
 *
 * The Azure remaining credit balance is NOT fetchable via CLI (balanceSummary
 * returns 403 without the Billing Reader role, which we do not have). Balance
 * stays manually seeded in vendors.json._pools.Azure.current_balance_usd.
 *
 * See .claude/skills/provider-billing/providers/azure.md for field semantics.
 */

const SUBSCRIPTION_ID = "7725a3f5-6483-4079-ba51-a317aa4fc09e";
const API_VERSION = "2024-08-01";

function azRest(url) {
    return new Promise((resolve, reject) => {
        const child = spawn("az", ["rest", "--method", "get", "--url", url], {
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
                reject(new Error(`az rest failed (${code}): ${stderr}`));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(
                    new Error(`az rest returned invalid JSON: ${e.message}`),
                );
            }
        });
    });
}

/**
 * Fetch MTD usage for a given month. currentMonth is "YYYY-MM".
 * Walks nextLink pagination until exhausted.
 */
export async function fetchMtd(currentMonth) {
    const [y, m] = currentMonth.split("-").map(Number);
    const startDate = `${currentMonth}-01T00:00:00Z`;
    // End date = today (we only want records up to now, not full month)
    const today = new Date();
    const endDateStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}T23:59:59Z`;

    const filter = encodeURIComponent(
        `properties/usageStart ge '${startDate}' and properties/usageEnd le '${endDateStr}'`,
    );
    let url = `https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.Consumption/usageDetails?api-version=${API_VERSION}&$filter=${filter}&$top=1000`;

    let mtd_total_usd = 0;
    let mtd_credit_usd = 0;
    let mtd_cash_usd = 0;
    let records = 0;

    while (url) {
        const data = await azRest(url);
        const items = data.value ?? [];
        for (const t of items) {
            const p = t.properties ?? {};
            const usd = Number(p.costInUSD ?? 0) || 0;
            const elig = Boolean(p.isAzureCreditEligible);
            mtd_total_usd += usd;
            if (elig) mtd_credit_usd += usd;
            else mtd_cash_usd += usd;
            records += 1;
        }
        url = data.nextLink ?? null;
    }

    return {
        mtd_total_usd: Number(mtd_total_usd.toFixed(2)),
        mtd_credit_usd: Number(mtd_credit_usd.toFixed(2)),
        mtd_cash_usd: Number(mtd_cash_usd.toFixed(2)),
        records,
        as_of: new Date().toISOString().slice(0, 10),
    };
}
