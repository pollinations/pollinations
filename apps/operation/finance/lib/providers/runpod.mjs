/**
 * Runpod provider — fetches live credit balance + burn rate from Runpod's GraphQL API.
 *
 * Unlike Azure/AWS, Runpod does NOT expose a month-to-date consumption endpoint.
 * The only way to compute "how much credit was consumed this month so far" is to
 * diff the current balance against the balance at the start of the month (stored
 * as `month_open_balance_usd` in the pool state).
 *
 * This wrapper is responsible for its own stateful tracking:
 *   - On the first run of a new month, seed `month_open_balance_usd` from
 *     the current balance (or from whatever value the orchestrator passes in
 *     via pool.month_open_balance_usd if the operator pre-seeded it).
 *   - On every run, compute mtd_credit = month_open_balance - current_balance.
 *   - Top-up detection: if current_balance > month_open_balance, the pool was
 *     topped up mid-month. Reset month_open_balance to current value and log
 *     a warning so MTD doesn't get a negative number.
 *
 * Returns the same shape as the other provider wrappers:
 *   { mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of }
 *
 * Runpod is credit-only (zero cash spend ever via Runpod — it's a pre-funded
 * pool), so mtd_cash_usd is always 0.
 *
 * Also mutates `pool` in place to update month_open tracking fields. The
 * caller saves vendors.json after all wrappers have run.
 *
 * See .claude/skills/provider-billing/providers/runpod.md for field semantics.
 */

const GRAPHQL_URL = "https://api.runpod.io/graphql";

async function runpodQuery(apiKey, query) {
    const url = `${GRAPHQL_URL}?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) {
        throw new Error(`Runpod API HTTP ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    if (body.errors) {
        throw new Error(`Runpod GraphQL: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
}

/**
 * @param {string} currentMonth  — "YYYY-MM"
 * @param {object} pool          — vendors.json._pools.Runpod entry; mutated in place
 * @returns {Promise<{mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of}>}
 */
export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
        throw new Error(
            "RUNPOD_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    const data = await runpodQuery(
        apiKey,
        `query {
          myself {
            clientBalance
            currentSpendPerHr
            pods {
              id
              name
              desiredStatus
              costPerHr
              gpuCount
              machine { gpuDisplayName }
            }
          }
        }`,
    );
    const me = data?.myself;
    if (!me) throw new Error("Runpod: empty myself{} response");

    const currentBalance = Number(me.clientBalance ?? 0);
    const burnPerHour = Number(me.currentSpendPerHr ?? 0);

    // Build a normalized instances list for the fleet tab.
    // Keep only the fields fleet-layout needs, in a shape shared across providers.
    const rawPods = Array.isArray(me.pods) ? me.pods : [];
    pool.instances = rawPods
        .filter((p) => p.desiredStatus === "RUNNING")
        .map((p) => ({
            provider: "Runpod",
            name: p.name ?? p.id ?? "",
            gpu: `${p.gpuCount ?? 1}× ${p.machine?.gpuDisplayName ?? "?"}`,
            status: p.desiredStatus ?? "",
            cost_per_hour_usd: Number(p.costPerHr ?? 0),
        }));

    // Stateful tracking. Three cases:
    //   (a) First run this month → seed month_open to current balance
    //   (b) Same month → compute mtd_credit = month_open - current
    //   (c) Top-up detected (current > month_open) → reset month_open, log warn
    let mtdCredit = 0;
    if (pool.month_open_as_of !== currentMonth) {
        // New month: seed. If the operator pre-seeded month_open_balance_usd
        // with a known historical value (e.g. "we started April at $2,500"),
        // preserve it — we detect that by the presence of a seed that's
        // GREATER than the live balance (indicating known prior state).
        // Otherwise use the live value.
        const preSeeded = pool.month_open_balance_usd;
        if (
            typeof preSeeded === "number" &&
            preSeeded >= currentBalance &&
            pool.month_open_as_of === undefined
        ) {
            // First run, operator pre-seeded a higher opening balance — trust it.
            mtdCredit = preSeeded - currentBalance;
        } else {
            pool.month_open_balance_usd = currentBalance;
            mtdCredit = 0;
        }
        pool.month_open_as_of = currentMonth;
    } else {
        // Same month: compute delta
        const monthOpen = pool.month_open_balance_usd ?? currentBalance;
        if (currentBalance > monthOpen) {
            // Top-up detected. Reset baseline and reset MTD to 0.
            console.warn(
                `  Runpod: top-up detected (balance $${currentBalance.toFixed(2)} > month_open $${monthOpen.toFixed(2)}), resetting baseline`,
            );
            pool.month_open_balance_usd = currentBalance;
            mtdCredit = 0;
        } else {
            mtdCredit = monthOpen - currentBalance;
        }
    }

    // Store extra fields for visibility (orchestrator will pick them up).
    pool.current_balance_usd = Number(currentBalance.toFixed(2));
    pool.burn_per_hour_usd = Number(burnPerHour.toFixed(4));

    return {
        mtd_total_usd: Number(mtdCredit.toFixed(2)),
        mtd_credit_usd: Number(mtdCredit.toFixed(2)),
        mtd_cash_usd: 0, // Runpod is credit-pool only, never cash
        records: 1,
        as_of: new Date().toISOString().slice(0, 10),
        // Signals to the orchestrator that this wrapper has already set
        // pool.current_balance_usd from a live API call, so the orchestrator
        // should NOT overwrite it with a seed-minus-mtd calculation.
        live_balance: true,
    };
}
