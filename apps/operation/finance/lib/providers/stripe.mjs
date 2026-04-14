/**
 * Stripe provider — fetches payout-arrival-dated revenue from /v1/payouts.
 *
 * Unlike the cost providers (Azure / AWS / Alibaba / GCP) this is a REVENUE
 * provider — it populates matrix.data with positive numbers for the Stripe
 * vendor, keyed by payout arrival date (not charge date). The arrival date
 * is what matters for runway math because it's exactly when the money hits
 * our Wise bank account, so replacing the Wise CSV's Stripe row with API
 * payout data keeps running-cash math accurate to the cent.
 *
 * Validated 2026-04-12: the three historical payouts on 2026-02-02 (€241),
 * 2026-03-02 (€4,227), 2026-04-01 (€5,962) match the Wise CSV deposits
 * exactly. See .claude/skills/provider-billing/providers/stripe.md.
 *
 * The common wrapper shape is awkward for a revenue provider because
 * mtd_credit / mtd_cash don't semantically fit. Instead, this wrapper writes
 * a `monthly_payouts` map directly into the pool state:
 *
 *   pool.monthly_payouts = {
 *     "2026-02": 241.18,
 *     "2026-03": 4227.21,
 *     "2026-04": 5961.71
 *   }
 *
 * rebuild-sheet.mjs reads that map and injects values into matrix.data[m][vendor]
 * for every month the API returned. This overrides the Wise CSV row because
 * API payout value = Wise deposit value (they reconcile to the cent).
 *
 * We use the "common wrapper" return shape for compatibility with update-live.mjs:
 *   mtd_total_usd  = sum of all payouts this month (native EUR, field misnamed)
 *   mtd_credit_usd = 0 (revenue has no "credit" concept)
 *   mtd_cash_usd   = same as mtd_total_usd — this is the number that lands in the bank
 *   live_balance   = true (skip seed-based balance derivation in orchestrator)
 */

const API_BASE = "https://api.stripe.com/v1";
// Fetch payouts since this date (inclusive). Anything earlier is pre-Pollinations-on-Stripe.
const PAYOUT_START_DATE = "2026-01-01";

function stripeGet(path, apiKey) {
    // Stripe uses HTTP Basic with API key as username and empty password.
    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    return fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Basic ${auth}` },
    }).then(async (r) => {
        if (!r.ok) {
            throw new Error(
                `Stripe API ${path} → HTTP ${r.status}: ${await r.text()}`,
            );
        }
        return r.json();
    });
}

async function fetchAllPayouts(apiKey, startUnix, endUnix) {
    const payouts = [];
    let startingAfter = null;
    for (let page = 0; page < 100; page++) {
        const qs = new URLSearchParams({
            limit: "100",
            "arrival_date[gte]": String(startUnix),
            "arrival_date[lte]": String(endUnix),
        });
        if (startingAfter) qs.set("starting_after", startingAfter);
        const d = await stripeGet(`/payouts?${qs.toString()}`, apiKey);
        const batch = d.data ?? [];
        payouts.push(...batch);
        if (!d.has_more || batch.length === 0) break;
        startingAfter = batch[batch.length - 1].id;
    }
    return payouts;
}

/**
 * @param {string} currentMonth  "YYYY-MM"
 * @param {object} pool          vendors.json._pools.Stripe (mutated)
 */
export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.STRIPE_API_KEY;
    if (!apiKey) {
        throw new Error(
            "STRIPE_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    const startUnix = Math.floor(
        new Date(`${PAYOUT_START_DATE}T00:00:00Z`).getTime() / 1000,
    );
    const endUnix = Math.floor(Date.now() / 1000);

    const payouts = await fetchAllPayouts(apiKey, startUnix, endUnix);

    // Aggregate per month using arrival_date
    const monthlyPayouts = {};
    let mtdThisMonth = 0;
    for (const p of payouts) {
        const arrivalDate = new Date(p.arrival_date * 1000);
        const monthKey = `${arrivalDate.getUTCFullYear()}-${String(arrivalDate.getUTCMonth() + 1).padStart(2, "0")}`;
        const amountEur = Number(p.amount ?? 0) / 100;
        monthlyPayouts[monthKey] = (monthlyPayouts[monthKey] ?? 0) + amountEur;
        if (monthKey === currentMonth) mtdThisMonth += amountEur;
    }

    // Round each month value
    for (const k of Object.keys(monthlyPayouts)) {
        monthlyPayouts[k] = Number(monthlyPayouts[k].toFixed(2));
    }

    pool.monthly_payouts = monthlyPayouts;
    pool.payout_count = payouts.length;
    pool.native_currency = "EUR"; // Stripe account is EUR — no FX needed
    pool.mtd_total_usd = Number(mtdThisMonth.toFixed(2));
    pool.mtd_credit_usd = 0;
    pool.mtd_cash_usd = Number(mtdThisMonth.toFixed(2));
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: payouts.length,
        as_of: pool.as_of,
        live_balance: true,
    };
}
