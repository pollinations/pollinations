import { categoryIndex, isRevenue } from "./categories.mjs";

// ---------- helpers ----------

const MONTH_ABBR = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

function monthLabel(ym, { isCurrent, isForecast }) {
    const [y, m] = ym.split("-").map(Number);
    const base = `${MONTH_ABBR[m - 1]} ${y}`;
    if (isCurrent) return `${base} (MTD)`;
    if (isForecast) return `${base} (fcst)`;
    return base;
}

function colLetter(zeroIdx) {
    // Column index to A1 letter. Good up to ZZ.
    let n = zeroIdx;
    let s = "";
    while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}

function a1(row, col) {
    return `${colLetter(col)}${row + 1}`;
}

function sheetRange(r1, c1, r2, c2) {
    return `Sheet1!${a1(r1, c1)}:${a1(r2, c2)}`;
}

function formatEuro(n) {
    // Used only for text strings in KPI summary — numeric cells get Sheet number formatting.
    const abs = Math.abs(n);
    const s = abs.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
    return `${n < 0 ? "-" : ""}€${s}`;
}

function groupVendorsByCategory(vendors) {
    const byCat = new Map();
    for (const [vendor, category] of Object.entries(vendors)) {
        if (!byCat.has(category)) byCat.set(category, []);
        byCat.get(category).push(vendor);
    }
    // Sort categories by canonical order, vendors alphabetically
    const ordered = [...byCat.entries()].sort(
        (a, b) => categoryIndex(a[0]) - categoryIndex(b[0]),
    );
    for (const [, list] of ordered) list.sort();
    return ordered;
}

function sumRowForVendors(matrix, month, vendors) {
    return vendors.reduce((s, v) => s + (matrix.data[month][v] ?? 0), 0);
}

// ---------- runway KPIs ----------

function computeKpis(matrix, config, { currentMonth }) {
    const actualMonths = matrix.months.filter(
        (m) => !matrix.forecastMonths.has(m) && m !== currentMonth,
    );
    const lastThree = actualMonths.slice(-3);
    let burn = 0;
    if (lastThree.length > 0) {
        const nets = lastThree.map((m) => {
            let total = 0;
            for (const v of Object.keys(matrix.vendors))
                total += matrix.data[m][v] ?? 0;
            return total;
        });
        burn = nets.reduce((a, b) => a + b, 0) / nets.length;
    }
    const burnAbs = Math.abs(burn);
    const runwayMonths = burnAbs > 0 ? config.cashBalance / burnAbs : Infinity;
    const runwayText =
        runwayMonths === Infinity ? "∞" : runwayMonths.toFixed(1);
    return {
        burn,
        runwayMonths,
        text: `Cash: ${formatEuro(config.cashBalance)} | Burn (avg3): ${formatEuro(Math.round(burn))} | Runway: ${runwayText} months`,
    };
}

// ---------- main ----------

/**
 * Pure layout builder. Returns everything needed to render a sheet but knows
 * nothing about gog, Google Sheets, or I/O. A future HTML/Notion renderer
 * can consume the same output.
 *
 * @param {object} matrix  - from forecast(aggregate(...))
 * @param {object} config  - { cashBalance, cashBalanceAsOf, ... }
 * @param {object} options - { currentMonth: "YYYY-MM" } (passed explicitly for testability)
 * @returns { cells: any[][], formats: Array<{range, format, fields, label}>, columnWidths: Array<{col, width}>, freezeRows: number }
 */
export function buildLayout(matrix, config, { currentMonth }) {
    const cells = [];
    const formats = [];

    const { months } = matrix;

    // Column index of each month (after Category, Vendor = 2 static columns)
    const monthCol = (monthIdx) => 2 + monthIdx;
    const totalCol = 2 + months.length; // "Total actual" column

    // --- row 0: title ---
    const titleRow = [
        "POLLINATIONS FINANCE — RUNWAY TRACKER",
        ...Array(totalCol).fill(""),
    ];
    cells.push(titleRow);
    formats.push({
        label: "title",
        range: sheetRange(0, 0, 0, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
        format: {
            textFormat: {
                bold: true,
                fontSize: 16,
                foregroundColor: { red: 1, green: 1, blue: 1 },
            },
            backgroundColor: { red: 0.15, green: 0.15, blue: 0.2 },
        },
    });

    // --- row 1: blank ---
    cells.push(Array(totalCol + 1).fill(""));

    // --- row 2: KPIs ---
    const kpi = computeKpis(matrix, config, { currentMonth });
    const kpiRow = [kpi.text, ...Array(totalCol).fill("")];
    cells.push(kpiRow);
    formats.push({
        label: "kpi",
        range: sheetRange(2, 0, 2, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
        format: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.95, green: 0.97, blue: 1 },
        },
    });

    // --- row 3: blank ---
    cells.push(Array(totalCol + 1).fill(""));

    // --- row 4: header ---
    const currentMonthIdx = months.indexOf(currentMonth); // may be -1
    const headerRow = ["Category", "Vendor"];
    for (const m of months) {
        headerRow.push(
            monthLabel(m, {
                isCurrent: m === currentMonth,
                isForecast: matrix.forecastMonths.has(m) && m !== currentMonth,
            }),
        );
    }
    headerRow.push("Total actual");
    cells.push(headerRow);
    const headerRowIdx = cells.length - 1;
    formats.push({
        label: "header",
        range: sheetRange(headerRowIdx, 0, headerRowIdx, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
            borders: { bottom: { style: "SOLID" } },
        },
    });

    // --- vendor rows grouped by category ---
    const grouped = groupVendorsByCategory(matrix.vendors);

    for (const [category, vendors] of grouped) {
        // Category header row
        const catHeader = [category, "", ...Array(months.length + 1).fill("")];
        cells.push(catHeader);
        const catRowIdx = cells.length - 1;
        formats.push({
            label: `category-${category}`,
            range: sheetRange(catRowIdx, 0, catRowIdx, totalCol),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
            format: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.85, green: 0.9, blue: 1 },
            },
        });

        // Vendor rows
        for (const vendor of vendors) {
            const row = ["", vendor];
            let totalActual = 0;
            for (let i = 0; i < months.length; i++) {
                const m = months[i];
                const v = matrix.data[m][vendor] ?? 0;
                row.push(Number(v.toFixed(2)));
                if (!matrix.forecastMonths.has(m) && m !== currentMonth)
                    totalActual += v;
            }
            row.push(Number(totalActual.toFixed(2)));
            cells.push(row);
        }

        // Subtotal row
        const subtotal = ["", `${category} subtotal`];
        for (const m of months) {
            subtotal.push(
                Number(sumRowForVendors(matrix, m, vendors).toFixed(2)),
            );
        }
        // Total actual for subtotal = sum of actual months only
        let subtotalActual = 0;
        for (const m of months) {
            if (!matrix.forecastMonths.has(m) && m !== currentMonth) {
                subtotalActual += sumRowForVendors(matrix, m, vendors);
            }
        }
        subtotal.push(Number(subtotalActual.toFixed(2)));
        cells.push(subtotal);
        const subRowIdx = cells.length - 1;
        formats.push({
            label: `subtotal-${category}`,
            range: sheetRange(subRowIdx, 1, subRowIdx, totalCol),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.borders",
            format: {
                textFormat: { bold: true, italic: true },
                borders: { top: { style: "SOLID" } },
            },
        });

        // Blank spacer
        cells.push(Array(totalCol + 1).fill(""));
    }

    // --- TOTAL EXPENSES row (sum of all expense vendors) ---
    const expenseVendors = Object.entries(matrix.vendors)
        .filter(([, cat]) => !isRevenue(cat))
        .map(([v]) => v);
    const revenueVendors = Object.entries(matrix.vendors)
        .filter(([, cat]) => isRevenue(cat))
        .map(([v]) => v);

    const totalExpRow = ["", "TOTAL EXPENSES"];
    for (const m of months)
        totalExpRow.push(
            Number(sumRowForVendors(matrix, m, expenseVendors).toFixed(2)),
        );
    totalExpRow.push("");
    cells.push(totalExpRow);
    const totalExpRowIdx = cells.length - 1;
    formats.push({
        label: "totalExpenses",
        range: sheetRange(totalExpRowIdx, 0, totalExpRowIdx, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.95, green: 0.85, blue: 0.85 },
            borders: {
                top: { style: "SOLID_THICK" },
                bottom: { style: "SOLID" },
            },
        },
    });

    // --- NET row ---
    const netRow = ["", "NET (Revenue − Expenses)"];
    for (const m of months) {
        const net =
            sumRowForVendors(matrix, m, revenueVendors) +
            sumRowForVendors(matrix, m, expenseVendors);
        netRow.push(Number(net.toFixed(2)));
    }
    netRow.push("");
    cells.push(netRow);
    const netRowIdx = cells.length - 1;
    formats.push({
        label: "net",
        range: sheetRange(netRowIdx, 0, netRowIdx, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 },
            borders: { bottom: { style: "SOLID_THICK" } },
        },
    });

    // --- Running cash row ---
    cells.push(Array(totalCol + 1).fill(""));
    const cashRow = ["", "Running cash"];
    const asOfMonth = config.cashBalanceAsOf
        ? config.cashBalanceAsOf.slice(0, 7)
        : months[0];
    let running = config.cashBalance;
    let started = false;
    for (const m of months) {
        if (m === asOfMonth) started = true;
        if (!started) {
            cashRow.push("");
            continue;
        }
        const net =
            sumRowForVendors(matrix, m, revenueVendors) +
            sumRowForVendors(matrix, m, expenseVendors);
        running += net;
        cashRow.push(Number(running.toFixed(2)));
    }
    cashRow.push("");
    cells.push(cashRow);
    const cashRowIdx = cells.length - 1;
    formats.push({
        label: "runningCash",
        range: sheetRange(cashRowIdx, 0, cashRowIdx, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
        format: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.9, green: 0.9, blue: 1 },
        },
    });

    // --- Column-level formats for current + forecast ---
    const lastRow = cells.length - 1;
    if (currentMonthIdx >= 0) {
        const c = monthCol(currentMonthIdx);
        formats.push({
            label: "currentMonthColumn",
            range: `Sheet1!${colLetter(c)}${headerRowIdx + 1}:${colLetter(c)}${lastRow + 1}`,
            fields: "userEnteredFormat.backgroundColor",
            format: { backgroundColor: { red: 1, green: 1, blue: 0.85 } },
        });
    }
    const forecastIdxs = months
        .map((m, i) =>
            matrix.forecastMonths.has(m) && m !== currentMonth ? i : -1,
        )
        .filter((i) => i >= 0);
    if (forecastIdxs.length > 0) {
        const first = monthCol(forecastIdxs[0]);
        const last = monthCol(forecastIdxs.at(-1));
        formats.push({
            label: "forecastColumns",
            range: `Sheet1!${colLetter(first)}${headerRowIdx + 1}:${colLetter(last)}${lastRow + 1}`,
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor",
            format: {
                backgroundColor: { red: 0.94, green: 0.94, blue: 0.94 },
                textFormat: {
                    italic: true,
                    foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 },
                },
            },
        });
    }

    // --- Column widths ---
    const columnWidths = [
        { col: 0, width: 150 }, // Category
        { col: 1, width: 220 }, // Vendor
    ];
    for (let i = 0; i < months.length; i++)
        columnWidths.push({ col: 2 + i, width: 110 });
    columnWidths.push({ col: totalCol, width: 120 });

    return {
        cells,
        formats,
        columnWidths,
        freezeRows: headerRowIdx + 1,
    };
}
