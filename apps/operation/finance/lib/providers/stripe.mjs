/**
 * Stripe provider — fetches two things from the Stripe API:
 *
 * 1. Historical payouts (by arrival date) — one row per past month. Stored in
 *    `pool.monthly_payouts` for sanity-checking against the Wise feed. Not
 *    currently injected into the sheet; the Wise activity feed already
 *    reports these as cash inflows on their arrival date.
 *
 * 2. Live month-to-date net revenue (by charge date) — sum of every
 *    balance_transaction created in the current calendar month, net of Stripe
 *    fees, excluding payouts. This is the "what we're currently winning"
 *    number that rebuild-sheet.mjs writes into the current-month Stripe cell,
 *    replacing the Apr-1 payout value (which represented March's activity).
 *    Stored in `pool.mtd_live_net_eur`.
 *
 * Validated 2026-04-12: the three historical payouts on 2026-02-02 (€241),
 * 2026-03-02 (€4,227), 2026-04-01 (€5,962) match the Wise CSV deposits
 * exactly. See .claude/skills/provider-billing/providers/stripe.md.
 *
 * We use the "common wrapper" return shape for compatibility with update-live.mjs:
 *   mtd_total_usd  = live MTD net (native EUR, field misnamed)
 *   mtd_credit_usd = 0 (revenue has no "credit" concept)
 *   mtd_cash_usd   = same as mtd_total_usd — this is revenue expected to pay out next month
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

async function fetchAllBalanceTransactions(apiKey, startUnix, endUnix) {
    const txns = [];
    let startingAfter = null;
    for (let page = 0; page < 100; page++) {
        const qs = new URLSearchParams({
            limit: "100",
            "created[gte]": String(startUnix),
            "created[lte]": String(endUnix),
        });
        if (startingAfter) qs.set("starting_after", startingAfter);
        const d = await stripeGet(
            `/balance_transactions?${qs.toString()}`,
            apiKey,
        );
        const batch = d.data ?? [];
        txns.push(...batch);
        if (!d.has_more || batch.length === 0) break;
        startingAfter = batch[batch.length - 1].id;
    }
    return txns;
}

/**
 * Sum net revenue (in cents) from a list of balance_transaction objects.
 * Excludes every payout-type transaction — those are outbound movements to
 * the bank and already captured by the Wise activity feed. Everything else
 * (charges, refunds, adjustments, Stripe fees) contributes to what will
 * eventually pay out.
 *
 * Pure. Extracted for unit testing.
 *
 * @param {Array<{type: string, net: number, currency: string}>} txns
 * @returns {number} sum of net values, in minor currency units (cents)
 */
export function sumNetRevenueCents(txns) {
    let total = 0;
    for (const t of txns) {
        if (typeof t.type === "string" && t.type.startsWith("payout")) continue;
        total += Number(t.net ?? 0);
    }
    return total;
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

    const historicalStartUnix = Math.floor(
        new Date(`${PAYOUT_START_DATE}T00:00:00Z`).getTime() / 1000,
    );
    const nowUnix = Math.floor(Date.now() / 1000);

    // --- 1. Historical payouts (for sanity-check against Wise) ---
    const payouts = await fetchAllPayouts(apiKey, historicalStartUnix, nowUnix);

    const monthlyPayouts = {};
    for (const p of payouts) {
        const arrivalDate = new Date(p.arrival_date * 1000);
        const monthKey = `${arrivalDate.getUTCFullYear()}-${String(arrivalDate.getUTCMonth() + 1).padStart(2, "0")}`;
        const amountEur = Number(p.amount ?? 0) / 100;
        monthlyPayouts[monthKey] = (monthlyPayouts[monthKey] ?? 0) + amountEur;
    }
    for (const k of Object.keys(monthlyPayouts)) {
        monthlyPayouts[k] = Number(monthlyPayouts[k].toFixed(2));
    }

    // --- 2. Live MTD net revenue (charges created in currentMonth) ---
    const monthStartUnix = Math.floor(
        new Date(`${currentMonth}-01T00:00:00Z`).getTime() / 1000,
    );
    const liveTxns = await fetchAllBalanceTransactions(
        apiKey,
        monthStartUnix,
        nowUnix,
    );
    const mtdLiveNetEur = Number(
        (sumNetRevenueCents(liveTxns) / 100).toFixed(2),
    );

    pool.monthly_payouts = monthlyPayouts;
    pool.payout_count = payouts.length;
    pool.native_currency = "EUR"; // Stripe account is EUR — no FX needed
    pool.mtd_live_net_eur = mtdLiveNetEur;
    pool.mtd_live_txn_count = liveTxns.length;
    pool.mtd_total_usd = mtdLiveNetEur;
    pool.mtd_credit_usd = 0;
    pool.mtd_cash_usd = mtdLiveNetEur;
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: payouts.length + liveTxns.length,
        as_of: pool.as_of,
        live_balance: true,
    };
}
