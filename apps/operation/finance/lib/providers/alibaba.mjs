import { spawn } from "node:child_process";

/**
 * Alibaba Cloud provider — fetches MTD spend via `aliyun BssOpenApi QueryBillOverview`.
 *
 * Unlike the 4 credit-pool providers (Azure / AWS / Runpod / Lambda), Alibaba
 * is PayAsYouGo with no standing credit pool. `QueryAccountBalance.AvailableAmount`
 * is always $0 — not meaningful. The only useful numbers are the per-month
 * bill overview, which gives us gross → discount → coupons → net cash.
 *
 * We treat this as a "kind: payg" pool in vendors.json:
 *   - `balance remaining` row: always "—" (no pool to track)
 *   - `consumed (credits)` row: sum of DeductedByCoupons + InvoiceDiscount
 *     (both are "money we didn't pay" — the user asked to combine them)
 *   - `consumed (cash)` row: sum of PretaxAmount (post-discount + post-coupon)
 *
 * Requires `aliyun` CLI 3.3.4+ and the `pollinations-finops` profile configured
 * per .claude/skills/provider-billing/providers/alibaba.md.
 *
 * Returns the common wrapper shape; does NOT set pool.current_balance_usd
 * (stays undefined to signal there's no pool).
 */

const PROFILE = "pollinations-finops";

function aliyunCmd(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("aliyun", args, {
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
                        `aliyun ${args.join(" ")} failed (${code}): ${stderr}`,
                    ),
                );
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`aliyun returned invalid JSON: ${e.message}`));
            }
        });
    });
}

/**
 * @param {string} currentMonth  "YYYY-MM"
 * @param {object} pool           vendors.json._pools.Alibaba (mutated)
 */
export async function fetchMtd(currentMonth, pool) {
    const data = await aliyunCmd([
        "--profile",
        PROFILE,
        "BssOpenApi",
        "QueryBillOverview",
        "--BillingCycle",
        currentMonth,
    ]);

    if (data?.Success !== true) {
        throw new Error(`Alibaba API error: ${JSON.stringify(data)}`);
    }

    const items = data?.Data?.Items?.Item ?? [];

    let gross = 0;
    let discount = 0;
    let coupons = 0;
    let net = 0;
    for (const it of items) {
        gross += Number(it.PretaxGrossAmount ?? 0) || 0;
        discount += Number(it.InvoiceDiscount ?? 0) || 0;
        coupons += Number(it.DeductedByCoupons ?? 0) || 0;
        net += Number(it.PretaxAmount ?? 0) || 0;
    }

    // Credit = coupons + invoice discount (both are "not paid in cash").
    // Cash   = net (post-discount, post-coupon)
    const mtdCredit = discount + coupons;
    const mtdCash = net;
    const mtdTotal = gross;

    // Alibaba has no standing pool. Store the breakdown fields for visibility
    // but leave current_balance_usd undefined so the layout renders "—".
    pool.mtd_total_usd = Number(mtdTotal.toFixed(2));
    pool.mtd_credit_usd = Number(mtdCredit.toFixed(2));
    pool.mtd_cash_usd = Number(mtdCash.toFixed(2));
    pool.mtd_discount_usd = Number(discount.toFixed(2));
    pool.mtd_coupons_usd = Number(coupons.toFixed(2));
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: items.length,
        as_of: pool.as_of,
        // live_balance: true tells the orchestrator to trust whatever the
        // wrapper set on the pool. For PayAsYouGo providers the wrapper
        // intentionally doesn't set current_balance_usd — orchestrator must
        // not derive it from seed - mtd_credit (there's no seed).
        live_balance: true,
    };
}
