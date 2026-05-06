/**
 * Deep Infra provider — fetches MTD spend via GET /payment/usage.
 *
 * Deep Infra is PayAsYouGo (no standing credit pool, no coupons). The
 * /payment/usage endpoint returns an array of months, each with a
 * `period` string ("YYYY-MM"), `interval { fr, to }`, and `total_cost`
 * in USD. We pick the entry matching currentMonth and report its
 * total_cost as MTD cash.
 *
 * Auth: Bearer token via DEEPINFRA_API_KEY in secrets/.env.
 *
 * Treated as `kind: "payg"` in vendors.json:
 *   - balance remaining row: always "—" (no pool)
 *   - consumed (credits): 0 (no credits)
 *   - consumed (cash): total_cost for the month
 *
 * The card charge lands in Wise the following month, so rebuild-sheet.mjs
 * injects mtd_cash_usd into nowMonth+1 (same as AWS/Alibaba).
 */

const USAGE_URL = "https://api.deepinfra.com/payment/usage";

export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.DEEPINFRA_API_KEY;
    if (!apiKey) {
        throw new Error(
            "DEEPINFRA_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    // Deep Infra requires `from` (Unix epoch seconds) and rejects ranges
    // longer than ~31 days or "too far in the past". Use start-of-currentMonth
    // → now, capping `to` at the current time so we never project into the
    // future (the API rejects that with HTTP 400).
    const [y, m] = currentMonth.split("-").map(Number);
    const fromSec = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
    const toSec = Math.floor(Date.now() / 1000);
    const url = `${USAGE_URL}?from=${fromSec}&to=${toSec}`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `Deep Infra API error ${res.status}: ${body.slice(0, 300)}`,
        );
    }
    const data = await res.json();
    const months = Array.isArray(data?.months) ? data.months : [];

    // We scoped the query to a single month, so take the period match if
    // present, otherwise the first entry returned.
    const entry = months.find((mo) => mo?.period === currentMonth) ?? months[0];

    const totalCost = Number(entry?.total_cost ?? 0);
    const items = Array.isArray(entry?.items) ? entry.items : [];

    pool.mtd_total_usd = Number(totalCost.toFixed(2));
    pool.mtd_credit_usd = 0;
    pool.mtd_cash_usd = Number(totalCost.toFixed(2));
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: items.length,
        as_of: pool.as_of,
        // Payg: no standing balance — orchestrator must skip seed-derived balance.
        live_balance: true,
    };
}
