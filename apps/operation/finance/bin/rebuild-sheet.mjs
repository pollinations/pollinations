#!/usr/bin/env node
import { aggregate } from "../lib/aggregate.mjs";
import { buildFleetLayout } from "../lib/fleet-layout.mjs";
import { forecast } from "../lib/forecast.mjs";
import {
    applyFormat,
    applyNumberFormat,
    clearSheet,
    ensureTab,
    freeze,
    resizeColumn,
    updateValues,
} from "../lib/gog.mjs";
import {
    loadConfig,
    loadDotenv,
    loadSharedModelSecrets,
    loadVendors,
    saveVendors,
} from "../lib/io.mjs";
import { buildLayout } from "../lib/layout.mjs";
import { normalize } from "../lib/normalize.mjs";
import { promptNewVendor } from "../lib/prompt.mjs";
import { fetchMonths } from "../lib/providers/wise-transactions.mjs";

function colLetter(zeroIdx) {
    let n = zeroIdx;
    let s = "";
    while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}

function currentMonthFromClock() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatUnmatchedTable(stats) {
    const cpWidth = Math.max(12, ...stats.map((s) => s.counterparty.length));
    const header = `  ${"COUNTERPARTY".padEnd(cpWidth)}   COUNT   SUM EUR`;
    const sep = `  ${"-".repeat(cpWidth)}   -----   ---------`;
    const rows = stats.map(
        (s) =>
            `  ${s.counterparty.padEnd(cpWidth)}   ${String(s.count).padStart(5)}   ${s.sumEur.toFixed(2).padStart(9)}`,
    );
    return [header, sep, ...rows].join("\n");
}

async function resolveVendorsInteractively(rawRows) {
    const vendors = await loadVendors();
    for (;;) {
        const { canonical, unknown, unknownStats } = normalize(
            rawRows,
            vendors,
        );
        if (unknown.length === 0) {
            return { vendors, canonicalRows: canonical, unmatched: null };
        }

        // Non-interactive (cron/launchd): print a clear summary to stderr so
        // the break is visible in update-live.err. Return the summary so the
        // caller can still render the sheet (with a warn row) and then exit
        // non-zero at the very end. Hanging on readline in launchd would
        // silently hide missing data.
        if (!process.stdin.isTTY) {
            const count = unknownStats.reduce((s, r) => s + r.count, 0);
            const sumEur = Number(
                unknownStats.reduce((s, r) => s + r.sumEur, 0).toFixed(2),
            );
            console.error(
                [
                    "",
                    `⚠ ${unknown.length} unmatched counterparty(ies) in Wise feed (non-interactive run).`,
                    `  Total unmatched transactions: ${count}  (sum: ${sumEur.toFixed(2)} EUR)`,
                    "",
                    formatUnmatchedTable(unknownStats),
                    "",
                    "  Fix: run `node bin/rebuild-sheet.mjs` from an interactive shell to classify these vendors,",
                    "       or add them manually to secrets/vendors.json.",
                    "",
                ].join("\n"),
            );
            return {
                vendors,
                canonicalRows: canonical,
                unmatched: { count, sumEur, stats: unknownStats },
            };
        }

        console.log(
            `\n${unknown.length} unknown vendor(s) — resolving interactively.`,
        );
        for (const u of unknown) {
            const entry = await promptNewVendor(u);
            vendors[u] = entry;
        }
        await saveVendors(vendors);
    }
}

async function main() {
    // Load secrets — shared SOPS file first (provider/model API keys), then
    // finance's local .env (WISE_API_TOKEN and any local overrides).
    await loadSharedModelSecrets();
    await loadDotenv();

    const config = await loadConfig();
    const account = config.gogAccount;
    const spreadsheetId = config.spreadsheetId;
    if (!spreadsheetId || !account) {
        throw new Error(
            "config.local.json must set spreadsheetId and gogAccount",
        );
    }

    const nowMonth = currentMonthFromClock();

    // Fetch Wise transactions from the cash-balance start month through the
    // current month. The current month includes real payments that have
    // already left the bank (e.g. salaries, office, freelancers). For vendors
    // with no Wise transaction yet this month, forecast rules fill the gap.
    const startMonth = config.cashBalanceAsOf
        ? config.cashBalanceAsOf.slice(0, 7)
        : nowMonth;
    const endMonth = nowMonth;

    // Fetch transactions from Wise API (all months including current)
    console.log(`Fetching Wise transactions ${startMonth} → ${endMonth}...`);
    const rawRows = await fetchMonths(startMonth, endMonth);
    console.log(`Loaded ${rawRows.length} transactions from Wise API.`);

    // Resolve unknown vendors interactively. In non-interactive mode,
    // unmatched rows are skipped with a stderr table; the sheet still gets
    // built with a visible warn row, and we exit 1 at the end.
    const { vendors, canonicalRows, unmatched } =
        await resolveVendorsInteractively(rawRows);

    // Aggregate → forecast → layout
    const matrix = aggregate(canonicalRows);
    const extended = forecast(matrix, vendors, config.forecastMonths ?? 6, {
        currentMonth: nowMonth,
    });

    // Current month backfill: for vendors with no Wise transaction yet this
    // month, apply their forecast rule so the sheet shows expected costs
    // (e.g. Deel salary, office rent) even before they're paid. Once a Wise
    // transaction lands, it naturally takes precedence (non-zero in aggregate).
    if (extended.data[nowMonth]) {
        // Build a rule lookup: canonical → forecast rule
        const ruleByCanonical = {};
        for (const [key, entry] of Object.entries(vendors)) {
            if (key.startsWith("_")) continue;
            ruleByCanonical[entry.canonical] = entry.forecast;
        }
        // Compute avg3 from completed months (excluding current)
        const completedForAvg = extended.months.filter(
            (m) => !extended.forecastMonths.has(m) && m !== nowMonth,
        );
        const last3 = completedForAvg.slice(-3);
        for (const vendor of Object.keys(extended.vendors)) {
            const current = extended.data[nowMonth][vendor] ?? 0;
            if (current !== 0) continue; // Wise already has data
            const rule = ruleByCanonical[vendor];
            if (rule === "none" || rule === undefined) continue;
            let val = 0;
            if (typeof rule === "number") {
                val = rule;
            } else if (rule === "avg3" || rule === "live") {
                if (last3.length > 0) {
                    const sum = last3.reduce(
                        (s, m) => s + (extended.data[m][vendor] ?? 0),
                        0,
                    );
                    val = sum / last3.length;
                }
            } else if (rule === "last") {
                const lastM = completedForAvg.at(-1);
                if (lastM) val = extended.data[lastM][vendor] ?? 0;
            }
            if (val !== 0) {
                extended.data[nowMonth][vendor] = Number(val.toFixed(2));
            }
        }
    }

    // Credit pools live in vendors.json under the "_pools" key.
    const pools = vendors._pools ?? {};
    const poolHistory = {}; // TODO: load from secrets/pool-history.json

    // Inject live MTD cash from payg pool APIs into NEXT month (not current).
    // Payg providers (AWS, Alibaba) consume now but invoice next month —
    // the card charge lands in Wise one month later. Injecting into
    // nowMonth+1 keeps everything on a cash basis: the cost appears in
    // the month the money actually leaves the bank.
    const fxRate =
        typeof config.usd_to_eur === "number" ? config.usd_to_eur : 1;
    const [nowY, nowM] = nowMonth.split("-").map(Number);
    const nextMonth =
        nowM === 12
            ? `${nowY + 1}-01`
            : `${nowY}-${String(nowM + 1).padStart(2, "0")}`;
    if (extended.data[nextMonth]) {
        for (const pool of Object.values(pools)) {
            if (pool.role === "revenue") continue;
            const canonical = pool.vendor_canonical;
            if (!canonical) continue;
            if (pool.mtd_stale === true) continue;
            const cashUsd = pool.mtd_cash_usd;
            if (typeof cashUsd !== "number" || cashUsd === 0) continue;
            const rate = pool.native_currency === "EUR" ? 1 : fxRate;
            const cashEur = -Math.abs(cashUsd) * rate;
            extended.data[nextMonth][canonical] = cashEur;
        }
    }

    // Stripe revenue re-attribution (must run BEFORE the revenue forecast
    // block so the forecast's extrapolation base picks up the shifted March
    // value, not the pre-shift Wise value):
    //
    //  - Historical months (Jan–Mar) get shifted payouts: the payout arriving
    //    on day 1-2 of month M actually reflects month M-1's activity, so we
    //    move it back one column. Feb-2 payout → Jan column, Mar-2 → Feb,
    //    Apr-1 → Mar. The Wise-sourced Stripe row for those months is
    //    cleared first so we don't double-count.
    //
    //  - Current month (Apr) gets the live MTD net from the Stripe API —
    //    the activity happening right now, which will pay out next month.
    //
    // Running-cash reconciliation will drift slightly vs the actual bank
    // because the shift decouples "cash arrived" from "revenue shown". The
    // trade-off buys a cleaner runway projection. Explicit design choice.
    const stripePool = pools.Stripe;
    if (stripePool?.role === "revenue" && stripePool.mtd_stale !== true) {
        const canonical = stripePool.vendor_canonical ?? "Stripe";

        // Clear Wise-sourced Stripe values in all historical months (we're
        // about to repopulate them with shifted values).
        for (const m of extended.months) {
            if (extended.forecastMonths.has(m)) continue;
            if (m === nowMonth) continue;
            if (extended.data[m]?.[canonical] !== undefined) {
                extended.data[m][canonical] = 0;
            }
        }

        // Inject shifted historical payouts into the activity month.
        const payouts = stripePool.monthly_payouts ?? {};
        for (const [arrivalMonth, eurValue] of Object.entries(payouts)) {
            const activityMonth = prevMonth(arrivalMonth);
            if (!extended.data[activityMonth]) continue;
            if (activityMonth === nowMonth) continue; // live override below
            if (extended.forecastMonths.has(activityMonth)) continue;
            extended.data[activityMonth][canonical] = eurValue;
        }

        // Current-month live MTD net.
        if (
            typeof stripePool.mtd_live_net_eur === "number" &&
            extended.data[nowMonth]
        ) {
            extended.data[nowMonth][canonical] = stripePool.mtd_live_net_eur;
        }
    }

    // Revenue forecast: extrapolate from the last FINISHED month (excluding
    // the current month). The current month holds live MTD revenue (partial
    // activity) so it's not a stable base for extrapolation. For Stripe this
    // picks up the shifted Mar value (= Apr-1 payout = March's activity).
    const revenueVendors = ["Stripe", "Polar.sh"];
    const finishedMonths = extended.months.filter(
        (m) => !extended.forecastMonths.has(m) && m !== nowMonth,
    );
    const latestRevenueMonth = finishedMonths.at(-1);
    if (latestRevenueMonth) {
        const lastRevenue = {};
        for (const v of revenueVendors) {
            const amt = extended.data[latestRevenueMonth]?.[v] ?? 0;
            if (amt > 0) lastRevenue[v] = amt;
        }
        for (const m of extended.months) {
            if (m <= latestRevenueMonth) continue;
            if (m === nowMonth) continue; // current month already set above
            if (!extended.data[m]) continue;
            const existing = revenueVendors.reduce(
                (s, v) => s + (extended.data[m][v] ?? 0),
                0,
            );
            if (existing === 0) {
                for (const [v, amt] of Object.entries(lastRevenue)) {
                    extended.data[m][v] = amt;
                }
            }
        }
    }

    // One-time events from vendors.json._one_time_events: explicit
    // (month, vendor, amount) entries for things that don't fit the forecast
    // rules — one-off fundraises, deposits, refunds, etc. If the vendor has
    // no Wise history, it's added as a synthetic vendor so it gets its own
    // row. Remove the entry from vendors.json once the real Wise transaction
    // lands so the actual amount takes over.
    const oneTimeEvents = vendors._one_time_events ?? [];
    for (const event of oneTimeEvents) {
        if (!extended.data[event.month]) continue;
        if (!extended.vendors[event.vendor_canonical]) {
            extended.vendors[event.vendor_canonical] = event.category;
        }
        extended.data[event.month][event.vendor_canonical] = event.amount_eur;
    }

    const layout = buildLayout(extended, config, {
        currentMonth: nowMonth,
        pools,
        poolHistory,
        unmatched,
    });

    // Write to sheet
    console.log(
        `Writing ${layout.cells.length} rows × ${layout.cells[0].length} cols to sheet...`,
    );
    const lastCol = colLetter(layout.cells[0].length - 1);
    const fullCanvas = `Runway!A1:${lastCol}1000`;
    await clearSheet(spreadsheetId, fullCanvas, { account });

    // Wipe any lingering formatting from previous rebuilds
    await applyFormat(
        spreadsheetId,
        {
            range: fullCanvas,
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.fontSize,userEnteredFormat.backgroundColor,userEnteredFormat.borders,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.numberFormat",
            format: {
                textFormat: {
                    bold: false,
                    italic: false,
                    fontSize: 10,
                    foregroundColor: { red: 0.1, green: 0.1, blue: 0.12 },
                },
                backgroundColor: { red: 1, green: 1, blue: 1 },
                borders: {},
                horizontalAlignment: "LEFT",
                verticalAlignment: "MIDDLE",
            },
        },
        { account },
    );

    await updateValues(spreadsheetId, "Runway!A1", layout.cells, { account });

    for (const fmt of layout.formats) {
        await applyFormat(spreadsheetId, fmt, { account });
    }

    const firstMonthCol = colLetter(2);
    const totalCol = colLetter(2 + extended.months.length);
    const firstDataRow = layout.firstNumericRow;
    const numericRange = `Runway!${firstMonthCol}${firstDataRow}:${totalCol}${layout.cells.length}`;
    await applyNumberFormat(
        spreadsheetId,
        numericRange,
        '#,##0 "€";[RED]-#,##0 "€"',
        { account },
    );

    for (const range of layout.creditRowRanges ?? []) {
        await applyNumberFormat(
            spreadsheetId,
            range,
            '#,##0 "€";[BLUE]-#,##0 "€"',
            { account },
        );
    }

    for (const { col, width } of layout.columnWidths) {
        const letter = colLetter(col);
        await resizeColumn(spreadsheetId, `${letter}:${letter}`, width, {
            account,
        });
    }

    await freeze(spreadsheetId, layout.freezeRows, { account });

    // --- Fleet tab ---
    const hasInstances = Object.values(pools).some(
        (p) => Array.isArray(p.instances) && p.instances.length > 0,
    );
    if (hasInstances) {
        const fleet = buildFleetLayout(pools, config, { tab: "Fleet" });
        console.log(
            `Writing ${fleet.cells.length} rows to "${fleet.tab}" tab...`,
        );

        await ensureTab(spreadsheetId, fleet.tab, { account });

        const fleetLastCol = colLetter(fleet.cells[0].length - 1);
        const fleetCanvas = `${fleet.tab}!A1:${fleetLastCol}1000`;
        await clearSheet(spreadsheetId, fleetCanvas, { account });

        await applyFormat(
            spreadsheetId,
            {
                range: fleetCanvas,
                fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.fontSize,userEnteredFormat.backgroundColor,userEnteredFormat.borders,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment",
                format: {
                    textFormat: {
                        bold: false,
                        italic: false,
                        fontSize: 10,
                        foregroundColor: { red: 0.1, green: 0.1, blue: 0.12 },
                    },
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    borders: {},
                    horizontalAlignment: "LEFT",
                    verticalAlignment: "MIDDLE",
                },
            },
            { account },
        );

        await updateValues(spreadsheetId, `${fleet.tab}!A1`, fleet.cells, {
            account,
        });

        for (const fmt of fleet.formats) {
            await applyFormat(spreadsheetId, fmt, { account });
        }

        await applyNumberFormat(
            spreadsheetId,
            fleet.numericRange,
            '#,##0.00 "€"',
            { account },
        );

        for (const { col, width } of fleet.columnWidths) {
            const letter = colLetter(col);
            await resizeColumn(
                spreadsheetId,
                `${fleet.tab}!${letter}:${letter}`,
                width,
                { account },
            );
        }

        await freeze(spreadsheetId, fleet.freezeRows, {
            account,
            sheet: fleet.tab,
        });
    }

    console.log("\nDone.");
    console.log(`Vendors: ${Object.keys(extended.vendors).length}`);
    const actualCount = extended.months.filter(
        (m) => !extended.forecastMonths.has(m),
    ).length;
    console.log(
        `Months: ${extended.months.length} (${actualCount} actual + ${extended.forecastMonths.size} forecast)`,
    );
    const kpiRow = layout.cells.find(
        (r) => typeof r[0] === "string" && r[0].startsWith("Cash:"),
    );
    if (kpiRow) console.log(kpiRow[0]);

    // Non-interactive run with unmatched rows: the sheet is written with a
    // visible warn banner; signal failure to the caller (launchd/cron) so the
    // break is flagged in the run status too.
    if (unmatched) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
