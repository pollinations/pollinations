/**
 * OpenRouter provider — fetches live credit balance via GET /credits.
 *
 * OpenRouter reports account-level total credits and total usage. There is no
 * month-to-date endpoint, so this wrapper stores the all-time usage value seen
 * at the start of each month and computes MTD credit burn from the delta.
 *
 * Auth: Bearer token via OPENROUTER_MANAGEMENT_API_KEY in secrets/.env or env.
 */

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";

async function fetchJson(url, apiKey) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `OpenRouter API error ${res.status}: ${body.slice(0, 300)}`,
        );
    }
    return res.json();
}

/**
 * @param {string} currentMonth  — "YYYY-MM"
 * @param {object} pool          — vendors.json._pools.OpenRouter entry; mutated in place
 * @returns {Promise<{mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of, live_balance}>}
 */
export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
    if (!apiKey) {
        throw new Error(
            "OPENROUTER_MANAGEMENT_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    const body = await fetchJson(CREDITS_URL, apiKey);
    const totalCredits = Number(body?.data?.total_credits ?? 0);
    const totalUsage = Number(body?.data?.total_usage ?? 0);
    if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) {
        throw new Error(`OpenRouter: unexpected /credits response shape`);
    }

    let mtdCredit = 0;
    if (pool.month_open_as_of !== currentMonth) {
        const preSeeded = pool.month_open_usage_usd;
        if (
            typeof preSeeded === "number" &&
            preSeeded <= totalUsage &&
            pool.month_open_as_of === undefined
        ) {
            mtdCredit = totalUsage - preSeeded;
        } else {
            pool.month_open_usage_usd = totalUsage;
            mtdCredit = 0;
        }
        pool.month_open_as_of = currentMonth;
    } else {
        const monthOpen = pool.month_open_usage_usd ?? totalUsage;
        if (totalUsage < monthOpen) {
            console.warn(
                `  OpenRouter: usage counter decreased ($${totalUsage.toFixed(2)} < month_open $${monthOpen.toFixed(2)}), resetting baseline`,
            );
            pool.month_open_usage_usd = totalUsage;
            mtdCredit = 0;
        } else {
            mtdCredit = totalUsage - monthOpen;
        }
    }

    const currentBalance = totalCredits - totalUsage;
    pool.total_credits_usd = Number(totalCredits.toFixed(2));
    pool.total_usage_usd = Number(totalUsage.toFixed(2));
    pool.current_balance_usd = Number(currentBalance.toFixed(2));

    return {
        mtd_total_usd: Number(mtdCredit.toFixed(2)),
        mtd_credit_usd: Number(mtdCredit.toFixed(2)),
        mtd_cash_usd: 0,
        records: 1,
        as_of: new Date().toISOString().slice(0, 10),
        live_balance: true,
    };
}
