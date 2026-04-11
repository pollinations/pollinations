#!/usr/bin/env node
import { basename } from "node:path";
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
    listInputCsvs,
    loadConfig,
    loadVendors,
    readText,
    saveVendors,
} from "../lib/io.mjs";
import { buildLayout } from "../lib/layout.mjs";
import { normalize } from "../lib/normalize.mjs";
import { parseCsv } from "../lib/parse-csv.mjs";
import { promptNewVendor } from "../lib/prompt.mjs";

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

async function resolveVendorsInteractively(rawRows) {
    const vendors = await loadVendors();
    for (;;) {
        const { canonical, unknown } = normalize(rawRows, vendors);
        if (unknown.length === 0) return { vendors, canonicalRows: canonical };
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
    const config = await loadConfig();
    const account = config.gogAccount;
    const spreadsheetId = config.spreadsheetId;
    if (!spreadsheetId || !account) {
        throw new Error(
            "config.local.json must set spreadsheetId and gogAccount",
        );
    }

    const csvPaths = await listInputCsvs();
    if (csvPaths.length === 0) {
        console.error(
            "No CSVs in secrets/input/. Drop a YYYY-MM.csv file there and re-run.",
        );
        process.exit(1);
    }

    // Load all CSVs
    const rawRows = [];
    for (const path of csvPaths) {
        const text = await readText(path);
        const rows = parseCsv(text, { filename: basename(path) });
        rawRows.push(...rows);
    }
    console.log(
        `Loaded ${rawRows.length} rows from ${csvPaths.length} CSV file(s).`,
    );

    // Resolve unknown vendors interactively (refactored into helper to avoid var-in-loop pattern)
    const { vendors, canonicalRows } =
        await resolveVendorsInteractively(rawRows);

    // Aggregate → forecast → layout
    const matrix = aggregate(canonicalRows);
    const extended = forecast(matrix, vendors, config.forecastMonths ?? 6);

    // Credit pools live in vendors.json under the "_pools" key (config metadata,
    // not a vendor). Pool consumption history lives in a separate file so it
    // can accumulate across rebuilds without touching vendors.json.
    const pools = vendors._pools ?? {};
    const poolHistory = {}; // TODO v1.7: load from secrets/pool-history.json

    // Inject live MTD cash from the provider wrappers into the extended
    // matrix for the CURRENT MONTH ONLY, so subtotals/totals/net/running-cash
    // naturally aggregate it. We do this AFTER forecast() so we don't
    // interfere with the forecast module's view of "last actual month" —
    // the current month is still a forecast month as far as forecast
    // rules are concerned, but when live pool data exists for it, we
    // overwrite that forecast with the live number.
    //
    // Stale pools (mtd_stale: true) are skipped — we don't want to
    // clobber forecast values with a stale zero.
    const nowMonth = currentMonthFromClock();
    const fxRate =
        typeof config.usd_to_eur === "number" ? config.usd_to_eur : 1;
    if (extended.data[nowMonth]) {
        for (const pool of Object.values(pools)) {
            if (pool.role === "revenue") continue; // handled separately below
            const canonical = pool.vendor_canonical;
            if (!canonical) continue;
            if (pool.mtd_stale === true) continue;
            const cashUsd = pool.mtd_cash_usd;
            if (typeof cashUsd !== "number" || cashUsd === 0) continue;
            // Native-EUR pools (GCP) don't get FX applied.
            const rate = pool.native_currency === "EUR" ? 1 : fxRate;
            const cashEur = -Math.abs(cashUsd) * rate;
            // Overwrite forecast/zero with the real live number.
            extended.data[nowMonth][canonical] = cashEur;
        }
    }

    // Revenue providers (Stripe) publish a full per-month history via
    // `monthly_payouts`. Inject positive values for every month the API
    // returned. Overwrites the Wise CSV row in place because the API
    // payout value equals the Wise deposit value to the cent.
    //
    // Minimum-forecast floor: the most recent payout also becomes the
    // conservative floor for every future month in the grid, rounded down
    // to the nearest €100. Rationale: the business is growing, so "at
    // minimum next month's payout will match last month's." The floor
    // auto-updates as new payouts land.
    for (const pool of Object.values(pools)) {
        if (pool.role !== "revenue") continue;
        const canonical = pool.vendor_canonical;
        if (!canonical) continue;
        const payouts = pool.monthly_payouts;
        if (!payouts || typeof payouts !== "object") continue;

        // Inject actual values month-by-month
        for (const [month, amountEur] of Object.entries(payouts)) {
            if (!extended.data[month]) continue; // skip months outside the grid
            if (typeof amountEur !== "number") continue;
            extended.data[month][canonical] = Number(amountEur.toFixed(2));
        }

        // Floor forecast for every month AFTER the latest payout month
        const payoutMonths = Object.keys(payouts)
            .filter((m) => typeof payouts[m] === "number" && payouts[m] > 0)
            .sort();
        const latestPayoutMonth = payoutMonths.at(-1);
        if (latestPayoutMonth) {
            const latestAmount = payouts[latestPayoutMonth];
            // Round UP to nearest €100.
            const floorEur = Math.ceil(latestAmount / 100) * 100;
            for (const m of extended.months) {
                if (m <= latestPayoutMonth) continue;
                if (!extended.data[m]) continue;
                extended.data[m][canonical] = floorEur;
            }
        }
    }

    const layout = buildLayout(extended, config, {
        currentMonth: nowMonth,
        pools,
        poolHistory,
    });

    // Write to sheet
    console.log(
        `Writing ${layout.cells.length} rows × ${layout.cells[0].length} cols to sheet...`,
    );
    const lastCol = colLetter(layout.cells[0].length - 1);
    const fullCanvas = `Sheet1!A1:${lastCol}1000`;
    await clearSheet(spreadsheetId, fullCanvas, { account });

    // Wipe any lingering formatting from previous rebuilds so new formats
    // don't merge with stale state (stale bold/italic/background/border).
    await applyFormat(
        spreadsheetId,
        {
            range: fullCanvas,
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

    await updateValues(spreadsheetId, "Sheet1!A1", layout.cells, { account });

    for (const fmt of layout.formats) {
        await applyFormat(spreadsheetId, fmt, { account });
    }

    // Number format for all numeric cells in month columns + total.
    // Start at the row AFTER the header (layout.freezeRows+1) to avoid formatting
    // the header text cells as numbers (which would render month labels as date serials).
    const firstMonthCol = colLetter(2);
    const totalCol = colLetter(2 + extended.months.length);
    const firstDataRow = layout.freezeRows + 1;
    const numericRange = `Sheet1!${firstMonthCol}${firstDataRow}:${totalCol}${layout.cells.length}`;
    await applyNumberFormat(
        spreadsheetId,
        numericRange,
        '#,##0 "€";[RED]-#,##0 "€"',
        { account },
    );

    // Credit rows override: blue negatives instead of red. Credits are "money
    // not paid", not "money owed" — they shouldn't look alarming.
    // Applied AFTER the default so it wins on the targeted ranges.
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

    // --- Fleet tab: live GPU instances grouped by provider ---
    // Pulls from vendors._pools[*].instances which the provider wrappers
    // populate on every update-live.mjs run. Always rewritten from scratch.
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

        // Wipe lingering formats on the fleet canvas so rebuilds are idempotent.
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
                {
                    account,
                },
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
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
