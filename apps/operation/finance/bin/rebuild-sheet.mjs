#!/usr/bin/env node
import { basename } from "node:path";
import { aggregate } from "../lib/aggregate.mjs";
import { forecast } from "../lib/forecast.mjs";
import {
    applyFormat,
    applyNumberFormat,
    clearSheet,
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
    const layout = buildLayout(extended, config, {
        currentMonth: currentMonthFromClock(),
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

    for (const { col, width } of layout.columnWidths) {
        const letter = colLetter(col);
        await resizeColumn(spreadsheetId, `${letter}:${letter}`, width, {
            account,
        });
    }

    await freeze(spreadsheetId, layout.freezeRows, { account });

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
