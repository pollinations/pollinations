/**
 * Lambda Labs provider — the Lambda Cloud API exposes no billing endpoints
 * at all (validated 2026-04-11: /billing, /credits, /usage, /account,
 * /invoices all return 404). Only instance management works.
 *
 * Strategy: read the live list of running instances and sum each
 * `price_cents_per_hour` to get the current account-wide burn rate. Then
 * integrate the burn rate over time (between cron runs) to track MTD
 * consumption.
 *
 * Stateful fields in the pool:
 *   - month_open_balance_usd  — operator-seeded balance at start of month
 *   - mtd_credit_usd          — accumulator, incremented on each run
 *   - burn_per_hour_usd       — last-known burn rate (for display)
 *   - last_sampled_at         — ISO timestamp of last run (for delta calc)
 *
 * Integration error: burn rate is sampled once per cron run. If instances
 * start or stop between runs, the integration under/over-counts for the
 * interval. At daily sampling granularity, drift per month is bounded but
 * non-zero. Real invoice at month-end is the only authoritative source.
 *
 * Returns the same shape as other wrappers:
 *   { mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of, live_balance }
 */

const API_BASE = "https://cloud.lambdalabs.com/api/v1";

async function lambdaGet(path, apiKey) {
    // Lambda uses HTTP Basic with the API key as the username, empty password.
    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
        throw new Error(
            `Lambda API ${path} → HTTP ${res.status}: ${await res.text()}`,
        );
    }
    return res.json();
}

/**
 * @param {string} currentMonth — "YYYY-MM"
 * @param {object} pool          — vendors.json._pools.Lambda_Labs; mutated in place
 */
export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.LAMBDA_LABS_API_KEY;
    if (!apiKey) {
        throw new Error(
            "LAMBDA_LABS_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    const data = await lambdaGet("/instances", apiKey);
    const instances = data.data ?? [];

    // Sum price across active instances to get live burn rate.
    let centsPerHour = 0;
    let activeCount = 0;
    for (const inst of instances) {
        if (inst.status !== "active") continue;
        const price = inst.instance_type?.price_cents_per_hour ?? 0;
        centsPerHour += Number(price) || 0;
        activeCount += 1;
    }
    const burnPerHour = centsPerHour / 100;
    const nowIso = new Date().toISOString();

    // Integrate: increment mtd_credit_so_far by burn × (now - last_sample).
    // Three cases mirror the Runpod wrapper.
    let mtdCredit = Number(pool.mtd_credit_usd ?? 0);

    if (pool.month_open_as_of !== currentMonth) {
        // First run of a new month. Two sub-cases:
        //   (a) Truly the first time we see this month — approximate mtd by
        //       multiplying the current burn rate by the hours elapsed since
        //       the 1st of the month. This is a one-time backfill; subsequent
        //       runs integrate from `last_sampled_at`.
        //   (b) Run BEFORE the 1st (shouldn't happen) — fall back to 0.
        const monthStart = new Date(`${currentMonth}-01T00:00:00Z`);
        const hoursSinceMonthStart = Math.max(
            0,
            (Date.now() - monthStart.getTime()) / (1000 * 60 * 60),
        );
        mtdCredit = hoursSinceMonthStart * burnPerHour;
        pool.last_sampled_at = nowIso;
        pool.month_open_as_of = currentMonth;
    } else {
        // Same month: add the accumulated burn since last sample.
        const last = pool.last_sampled_at
            ? new Date(pool.last_sampled_at).getTime()
            : Date.now();
        const elapsedHours = Math.max(
            0,
            (Date.now() - last) / (1000 * 60 * 60),
        );
        const delta = elapsedHours * burnPerHour;
        mtdCredit += delta;
        pool.last_sampled_at = nowIso;
    }

    const monthOpen =
        pool.month_open_balance_usd ?? pool.current_balance_usd ?? 0;
    const currentBalance = Math.max(0, monthOpen - mtdCredit);

    pool.current_balance_usd = Number(currentBalance.toFixed(2));
    pool.burn_per_hour_usd = Number(burnPerHour.toFixed(4));
    pool.active_instance_count = activeCount;

    return {
        mtd_total_usd: Number(mtdCredit.toFixed(2)),
        mtd_credit_usd: Number(mtdCredit.toFixed(2)),
        mtd_cash_usd: 0,
        records: activeCount,
        as_of: new Date().toISOString().slice(0, 10),
        live_balance: true,
    };
}
