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

/**
 * Build a lookup: canonical vendor name → pool entry.
 * Used by the compute-section renderer to decide whether a vendor gets the
 * 3-row (balance/credit/cash) treatment or stays as a single row.
 */
function indexPoolsByVendor(pools) {
    const byVendor = new Map();
    for (const [poolName, pool] of Object.entries(pools)) {
        const canonical = pool.vendor_canonical;
        if (canonical) byVendor.set(canonical, { poolName, pool });
    }
    return byVendor;
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
    const fx = config.usd_to_eur;
    const fxAsOf = config.usd_to_eur_as_of;
    const fxText =
        typeof fx === "number"
            ? `  |  FX: 1 USD = €${fx.toFixed(2)}${fxAsOf ? ` (${fxAsOf})` : ""}`
            : "";
    return {
        burn,
        runwayMonths,
        text: `Cash: ${formatEuro(config.cashBalance)} | Burn (avg3): ${formatEuro(Math.round(burn))} | Runway: ${runwayText} months${fxText}`,
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
export function buildLayout(
    matrix,
    config,
    { currentMonth, pools = {}, poolHistory = {} } = {},
) {
    const cells = [];
    const formats = [];

    const { months } = matrix;

    // Column index of each month (after Category, Vendor = 2 static columns)
    const monthCol = (monthIdx) => 2 + monthIdx;
    const totalCol = 2 + months.length; // "Total actual" column

    // Design palette — minimal, consistent, neutral.
    const INK = { red: 0.1, green: 0.1, blue: 0.12 };
    const INK_MUTED = { red: 0.42, green: 0.45, blue: 0.5 };
    const WHITE = { red: 1, green: 1, blue: 1 };
    const BG_TITLE = { red: 0.12, green: 0.14, blue: 0.2 };
    const BG_KPI = { red: 0.98, green: 0.98, blue: 0.96 };
    const BG_HEADER = { red: 0.96, green: 0.96, blue: 0.97 };
    const BG_CATEGORY = { red: 0.92, green: 0.93, blue: 0.96 };
    const BG_SUBTOTAL = { red: 0.97, green: 0.97, blue: 0.98 };
    const BG_TOTAL = { red: 0.92, green: 0.92, blue: 0.94 };
    const BG_NET = { red: 0.88, green: 0.9, blue: 0.94 };
    const BG_CASH = { red: 0.86, green: 0.9, blue: 0.86 };
    const BG_CURRENT = { red: 1, green: 0.98, blue: 0.85 };
    const BG_FORECAST = { red: 0.97, green: 0.97, blue: 0.97 };

    // --- row 0: title ---
    const titleRow = [
        "Pollinations Finance — Runway Tracker",
        ...Array(totalCol).fill(""),
    ];
    cells.push(titleRow);
    formats.push({
        label: "title",
        range: sheetRange(0, 0, 0, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment,userEnteredFormat.horizontalAlignment",
        format: {
            textFormat: {
                bold: true,
                italic: false,
                fontSize: 14,
                foregroundColor: WHITE,
            },
            backgroundColor: BG_TITLE,
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "LEFT",
        },
    });

    // --- row 1: KPIs (no blank row above) ---
    const kpi = computeKpis(matrix, config, { currentMonth });
    const kpiRow = [kpi.text, ...Array(totalCol).fill("")];
    cells.push(kpiRow);
    formats.push({
        label: "kpi",
        range: sheetRange(1, 0, 1, totalCol),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment",
        format: {
            textFormat: {
                bold: false,
                italic: false,
                fontSize: 11,
                foregroundColor: INK,
            },
            backgroundColor: BG_KPI,
            verticalAlignment: "MIDDLE",
        },
    });

    // --- row 2: blank spacer ---
    cells.push(Array(totalCol + 1).fill(""));

    // --- row 3: header ---
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
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders,userEnteredFormat.horizontalAlignment",
        format: {
            textFormat: {
                bold: true,
                italic: false,
                fontSize: 10,
                foregroundColor: INK,
            },
            backgroundColor: BG_HEADER,
            borders: {
                bottom: { style: "SOLID", color: INK },
            },
            horizontalAlignment: "RIGHT",
        },
    });
    // Force left alignment for the Category and Vendor header cells
    formats.push({
        label: "headerLabels",
        range: sheetRange(headerRowIdx, 0, headerRowIdx, 1),
        fields: "userEnteredFormat.horizontalAlignment",
        format: { horizontalAlignment: "LEFT" },
    });

    // --- vendor rows grouped by category ---
    // Inject synthetic vendor entries for pool providers that have no Wise
    // history yet (e.g. Lambda Labs where we've never paid cash). Without
    // this injection, a pool-only provider would silently vanish from the
    // compute section because matrix.vendors only contains vendors that
    // appear in the CSVs. We do NOT inject data into matrix.data — those
    // vendors' cash row stays at 0 for every historical month, which is
    // correct (no CSV = no cash paid).
    const matrixVendors = { ...matrix.vendors };
    for (const pool of Object.values(pools)) {
        const canonical = pool.vendor_canonical;
        if (!canonical) continue;
        if (matrixVendors[canonical]) continue;
        matrixVendors[canonical] = "Compute";
    }

    const grouped = groupVendorsByCategory(matrixVendors);
    const poolByVendor = indexPoolsByVendor(pools);
    const fx = typeof config.usd_to_eur === "number" ? config.usd_to_eur : 1;

    // Track the row indices of the two "info" sub-rows per pool vendor
    // (balance remaining, consumed credits). These rows exist for display
    // only and must be excluded from subtotal/total/net/cash aggregations.
    // The "consumed cash" sub-row IS the aggregatable row — it holds the
    // same numbers the vendor row held before the 3-row rewrite.
    const infoRowIdxs = new Set();

    // Helper: render a pool vendor as 3 rows (balance / credit / cash).
    // Pool info rows (balance + credit) come from vendors.json._pools live data;
    // cash row comes from the canonical matrix, identical to a non-pool vendor.
    function renderPoolVendor(vendor, pool) {
        const history = poolHistory[pool.poolName] ?? {};

        // Row 1: balance remaining (informational — only populated in currentMonth).
        const balanceRow = ["", `    ${vendor} — balance remaining`];
        for (const m of months) {
            if (m === currentMonth) {
                const balUsd = pool.pool.current_balance_usd ?? 0;
                balanceRow.push(Number((balUsd * fx).toFixed(2)));
            } else {
                balanceRow.push("—");
            }
        }
        balanceRow.push(""); // Total actual — N/A for informational row
        cells.push(balanceRow);
        infoRowIdxs.add(cells.length - 1);

        // Row 2: consumed (credits) (informational — pulled from live MTD +
        // historical pool-history snapshots).
        const creditRow = ["", `    ${vendor} — consumed (credits)`];
        for (const m of months) {
            if (m === currentMonth) {
                const usedUsd = pool.pool.mtd_credit_usd ?? 0;
                // Consumption is displayed as a negative number (money out).
                creditRow.push(Number((-usedUsd * fx).toFixed(2)));
            } else if (history[m] !== undefined) {
                // history values are already negative (money out)
                creditRow.push(Number((history[m] * fx).toFixed(2)));
            } else {
                creditRow.push("—");
            }
        }
        creditRow.push(""); // Total actual — N/A for informational row
        cells.push(creditRow);
        infoRowIdxs.add(cells.length - 1);

        // Row 3: consumed (cash) — the REAL vendor row, identical to what
        // a non-pool vendor would emit. Pulled from matrix.data which comes
        // from the Wise CSVs. This row contributes to subtotal/total/net.
        const cashRow = ["", `    ${vendor} — consumed (cash)`];
        let totalActual = 0;
        for (let i = 0; i < months.length; i++) {
            const m = months[i];
            const v = matrix.data[m][vendor] ?? 0;
            cashRow.push(Number(v.toFixed(2)));
            if (!matrix.forecastMonths.has(m) && m !== currentMonth)
                totalActual += v;
        }
        cashRow.push(Number(totalActual.toFixed(2)));
        cells.push(cashRow);
    }

    // Helper: render a non-pool vendor as a single row (unchanged from v1.0).
    function renderPlainVendor(vendor) {
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

    for (const [category, vendors] of grouped) {
        // Category header row
        const catHeader = [category, "", ...Array(months.length + 1).fill("")];
        cells.push(catHeader);
        const catRowIdx = cells.length - 1;
        formats.push({
            label: `category-${category}`,
            range: sheetRange(catRowIdx, 0, catRowIdx, totalCol),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor",
            format: {
                textFormat: {
                    bold: true,
                    italic: false,
                    fontSize: 11,
                    foregroundColor: INK,
                },
                backgroundColor: BG_CATEGORY,
            },
        });

        // Vendor rows
        const firstVendorRowIdx = cells.length;
        for (const vendor of vendors) {
            const pool = poolByVendor.get(vendor);
            if (pool) {
                renderPoolVendor(vendor, pool);
            } else {
                renderPlainVendor(vendor);
            }
        }
        const lastVendorRowIdx = cells.length - 1;
        // Uniform plain style across the whole vendor block.
        formats.push({
            label: `vendors-${category}`,
            range: sheetRange(firstVendorRowIdx, 0, lastVendorRowIdx, totalCol),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor",
            format: {
                textFormat: {
                    bold: false,
                    italic: false,
                    fontSize: 10,
                    foregroundColor: INK,
                },
                backgroundColor: WHITE,
            },
        });
        // Apply a muted italic text style to the info rows within this block
        // (balance remaining, consumed credits) so they're visually distinct
        // from the aggregatable cash row.
        for (let i = firstVendorRowIdx; i <= lastVendorRowIdx; i++) {
            if (!infoRowIdxs.has(i)) continue;
            formats.push({
                label: `infoRow-${i}`,
                range: sheetRange(i, 1, i, totalCol),
                fields: "userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor",
                format: {
                    textFormat: {
                        italic: true,
                        foregroundColor: INK_MUTED,
                    },
                },
            });
        }

        // Subtotal row
        const subtotal = ["", `${category} subtotal`];
        for (const m of months) {
            subtotal.push(
                Number(sumRowForVendors(matrix, m, vendors).toFixed(2)),
            );
        }
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
            range: sheetRange(subRowIdx, 0, subRowIdx, totalCol),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
            format: {
                textFormat: {
                    bold: true,
                    italic: false,
                    fontSize: 10,
                    foregroundColor: INK,
                },
                backgroundColor: BG_SUBTOTAL,
                borders: {
                    top: { style: "SOLID", color: INK_MUTED },
                    bottom: { style: "SOLID", color: INK_MUTED },
                },
            },
        });
    }

    // --- TOTAL EXPENSES row ---
    const expenseVendors = Object.entries(matrix.vendors)
        .filter(([, cat]) => !isRevenue(cat))
        .map(([v]) => v);
    const revenueVendors = Object.entries(matrix.vendors)
        .filter(([, cat]) => isRevenue(cat))
        .map(([v]) => v);

    // Blank spacer before totals
    cells.push(Array(totalCol + 1).fill(""));

    const totalExpRow = ["", "Total expenses"];
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
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: {
                bold: true,
                italic: false,
                fontSize: 11,
                foregroundColor: INK,
            },
            backgroundColor: BG_TOTAL,
            borders: {
                top: { style: "SOLID", color: INK },
            },
        },
    });

    // --- NET row ---
    const netRow = ["", "Net (Revenue − Expenses)"];
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
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: {
                bold: true,
                italic: false,
                fontSize: 11,
                foregroundColor: INK,
            },
            backgroundColor: BG_NET,
            borders: {
                bottom: { style: "SOLID", color: INK },
            },
        },
    });

    // Blank spacer before running cash
    cells.push(Array(totalCol + 1).fill(""));

    // --- Running cash row ---
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
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: {
                bold: true,
                italic: false,
                fontSize: 11,
                foregroundColor: INK,
            },
            backgroundColor: BG_CASH,
            borders: {
                top: { style: "SOLID", color: INK_MUTED },
                bottom: { style: "SOLID", color: INK_MUTED },
            },
        },
    });

    // --- Column-level formats for current + forecast.
    // These apply AFTER row styles so they must not clobber bold/italic state.
    // Only the background color (and muted text color for forecast) changes.
    const lastRow = cells.length - 1;
    if (currentMonthIdx >= 0) {
        const c = monthCol(currentMonthIdx);
        formats.push({
            label: "currentMonthColumn",
            range: `Sheet1!${colLetter(c)}${headerRowIdx + 1}:${colLetter(c)}${lastRow + 1}`,
            fields: "userEnteredFormat.backgroundColor",
            format: { backgroundColor: BG_CURRENT },
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
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
            format: {
                backgroundColor: BG_FORECAST,
                textFormat: { foregroundColor: INK_MUTED },
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
