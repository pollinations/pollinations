/**
 * Fireworks AI provider — fetches live credit balance via firectl CLI.
 *
 * Fireworks exposes the account balance through `firectl account get`, which
 * returns a `Balance: USD <amount>` line. There is no MTD consumption endpoint;
 * we derive MTD from seed_balance - current_balance (same pattern as Runpod).
 *
 * The firectl CLI must be installed (`brew tap fw-ai/firectl && brew install firectl`).
 * Auth is via --api-key flag using FIREWORKS_API_KEY from secrets/.env.
 *
 * Returns the same shape as the other provider wrappers:
 *   { mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of, live_balance }
 *
 * Fireworks is credit-only (pre-funded pool), so mtd_cash_usd is always 0.
 * Sets live_balance: true so the orchestrator trusts our balance value.
 */

import { execFile } from "node:child_process";

function runFirectl(args) {
    return new Promise((resolve, reject) => {
        execFile("firectl", args, { timeout: 30_000 }, (err, stdout, stderr) => {
            if (err) {
                reject(
                    new Error(
                        `firectl failed: ${err.message}\n${stderr || ""}`.trim(),
                    ),
                );
                return;
            }
            resolve(stdout);
        });
    });
}

/**
 * @param {string} currentMonth  — "YYYY-MM"
 * @param {object} pool          — vendors.json._pools.Fireworks entry; mutated in place
 * @returns {Promise<{mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of, live_balance}>}
 */
export async function fetchMtd(currentMonth, pool) {
    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
        throw new Error(
            "FIREWORKS_API_KEY not set (expected in secrets/.env or process.env)",
        );
    }

    const accountId = pool.account_id ?? "pollinations";

    // firectl account get returns lines like:
    //   Balance: USD 10003.39
    const stdout = await runFirectl([
        "account",
        "get",
        "--api-key",
        apiKey,
        "--account-id",
        accountId,
    ]);

    const balanceMatch = stdout.match(/Balance:\s*USD\s+([\d.]+)/);
    if (!balanceMatch) {
        throw new Error(
            `Fireworks: could not parse balance from firectl output:\n${stdout}`,
        );
    }

    const currentBalance = Number(balanceMatch[1]);

    // Stateful month tracking (same pattern as Runpod):
    //   - New month: seed month_open to current balance
    //   - Same month: mtd = month_open - current
    //   - Top-up detected: reset month_open
    let mtdCredit = 0;
    if (pool.month_open_as_of !== currentMonth) {
        const preSeeded = pool.month_open_balance_usd;
        if (
            typeof preSeeded === "number" &&
            preSeeded >= currentBalance &&
            pool.month_open_as_of === undefined
        ) {
            mtdCredit = preSeeded - currentBalance;
        } else {
            pool.month_open_balance_usd = currentBalance;
            mtdCredit = 0;
        }
        pool.month_open_as_of = currentMonth;
    } else {
        const monthOpen = pool.month_open_balance_usd ?? currentBalance;
        if (currentBalance > monthOpen) {
            console.warn(
                `  Fireworks: top-up detected (balance $${currentBalance.toFixed(2)} > month_open $${monthOpen.toFixed(2)}), resetting baseline`,
            );
            pool.month_open_balance_usd = currentBalance;
            mtdCredit = 0;
        } else {
            mtdCredit = monthOpen - currentBalance;
        }
    }

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
