/**
 * Deep Infra provider — tracks prepaid credit balance and MTD usage.
 *
 * Deep Infra top-ups land in Wise as card purchases, then remain as account
 * credit until inference usage burns them down. That means live provider data
 * belongs in the pool info rows:
 *   - balance remaining: live checklist.stripe_balance
 *   - consumed credits: current-month usage total
 *   - consumed cash: 0 (cash already left Wise when the top-up happened)
 *
 * Auth: Bearer token via DEEPINFRA_API_KEY in secrets/.env.
 */

const ME_URL = "https://api.deepinfra.com/v1/me?checklist=true";
const USAGE_URL = "https://api.deepinfra.com/payment/usage";

async function fetchJson(url, apiKey) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `Deep Infra API error ${res.status}: ${body.slice(0, 300)}`,
        );
    }
    return res.json();
}

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

    const [me, data] = await Promise.all([
        fetchJson(ME_URL, apiKey),
        fetchJson(url, apiKey),
    ]);
    const months = Array.isArray(data?.months) ? data.months : [];

    // We scoped the query to a single month, so take the period match if
    // present, otherwise the first entry returned.
    const entry = months.find((mo) => mo?.period === currentMonth) ?? months[0];

    const currentBalance = Number(me?.checklist?.stripe_balance);
    if (!Number.isFinite(currentBalance)) {
        throw new Error("Deep Infra: unexpected /v1/me checklist response");
    }

    const totalCost = Number(entry?.total_cost ?? 0);
    const items = Array.isArray(entry?.items) ? entry.items : [];

    pool.kind = "credit";
    pool.current_balance_usd = Number(currentBalance.toFixed(2));
    pool.mtd_total_usd = Number(totalCost.toFixed(2));
    pool.mtd_credit_usd = Number(totalCost.toFixed(2));
    pool.mtd_cash_usd = 0;
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: items.length,
        as_of: pool.as_of,
        live_balance: true,
    };
}
