/**
 * Fleet layout builder — second tab showing live GPU instances grouped by
 * provider, with hourly/daily/monthly cost columns (all in EUR).
 *
 * Input: `pools` from vendors.json._pools — each pool may have an `instances`
 * array populated by its provider wrapper (lib/providers/*.mjs). Pools without
 * instances (Azure, AWS — serverless/container workloads that don't map to
 * "hourly GPU" model) are ignored.
 *
 * Output: the same shape as `buildLayout`:
 *   { cells, formats, columnWidths, freezeRows }
 *
 * Monthly cost assumes 730.56 hours/month (365.25 × 24 / 12 — average month).
 * Daily cost assumes 24 hours. Both are pure extrapolations from the current
 * $/hr rate; they don't know whether the instance actually ran for that long.
 */

const HOURS_PER_DAY = 24;
const HOURS_PER_MONTH = (365.25 * 24) / 12; // 730.56

// Consistent palette with the main sheet.
const INK = { red: 0.1, green: 0.1, blue: 0.12 };
const INK_MUTED = { red: 0.42, green: 0.45, blue: 0.5 };
const WHITE = { red: 1, green: 1, blue: 1 };
const BG_TITLE = { red: 0.12, green: 0.14, blue: 0.2 };
const BG_HEADER = { red: 0.96, green: 0.96, blue: 0.97 };
const BG_PROVIDER = { red: 0.92, green: 0.93, blue: 0.96 };
const BG_SUBTOTAL = { red: 0.97, green: 0.97, blue: 0.98 };
const BG_TOTAL = { red: 0.92, green: 0.92, blue: 0.94 };

function colLetter(zeroIdx) {
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

function sheetRange(tab, r1, c1, r2, c2) {
    return `${tab}!${a1(r1, c1)}:${a1(r2, c2)}`;
}

/**
 * @param {object} pools   vendors.json._pools (may contain .instances per pool)
 * @param {object} config  config.local.json (for usd_to_eur)
 * @param {object} options { tab = "Fleet" }
 * @returns { cells, formats, columnWidths, freezeRows, tab }
 */
export function buildFleetLayout(pools, config, { tab = "Fleet" } = {}) {
    const fx = typeof config.usd_to_eur === "number" ? config.usd_to_eur : 1;
    const cells = [];
    const formats = [];

    // Columns: 0=Provider, 1=Name, 2=GPU, 3=Status, 4=$/hr, 5=$/day, 6=$/month
    const LAST_COL = 6;

    // --- row 0: title ---
    cells.push([
        "Pollinations GPU Fleet — live snapshot",
        "",
        "",
        "",
        "",
        "",
        "",
    ]);
    formats.push({
        label: "title",
        range: sheetRange(tab, 0, 0, 0, LAST_COL),
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

    // --- row 1: as-of / FX info ---
    const updatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
    cells.push([
        `Updated: ${updatedAt} UTC  |  FX: 1 USD = €${fx.toFixed(2)}  |  Monthly = hourly × 730.56`,
        "",
        "",
        "",
        "",
        "",
        "",
    ]);
    formats.push({
        label: "asOf",
        range: sheetRange(tab, 1, 0, 1, LAST_COL),
        fields: "userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor",
        format: {
            textFormat: {
                italic: true,
                fontSize: 10,
                foregroundColor: INK_MUTED,
            },
            backgroundColor: WHITE,
        },
    });

    // --- row 2: blank spacer ---
    cells.push(["", "", "", "", "", "", ""]);

    // --- row 3: header ---
    cells.push([
        "Provider",
        "Name",
        "GPU",
        "Status",
        "€/hr",
        "€/day",
        "€/month",
    ]);
    const headerRowIdx = cells.length - 1;
    formats.push({
        label: "header",
        range: sheetRange(tab, headerRowIdx, 0, headerRowIdx, LAST_COL),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders,userEnteredFormat.horizontalAlignment",
        format: {
            textFormat: {
                bold: true,
                fontSize: 10,
                foregroundColor: INK,
            },
            backgroundColor: BG_HEADER,
            borders: { bottom: { style: "SOLID", color: INK } },
            horizontalAlignment: "RIGHT",
        },
    });
    // First four header cells are left-aligned labels.
    formats.push({
        label: "headerLabels",
        range: sheetRange(tab, headerRowIdx, 0, headerRowIdx, 3),
        fields: "userEnteredFormat.horizontalAlignment",
        format: { horizontalAlignment: "LEFT" },
    });

    // --- group instances by provider ---
    const byProvider = new Map();
    for (const [poolName, pool] of Object.entries(pools)) {
        const list = pool.instances;
        if (!Array.isArray(list) || list.length === 0) continue;
        // Use the provider field on the instance, not poolName, so we can
        // collapse e.g. two Runpod pools if they ever exist.
        for (const inst of list) {
            const key = inst.provider ?? poolName;
            if (!byProvider.has(key)) byProvider.set(key, []);
            byProvider.get(key).push(inst);
        }
    }

    let fleetHourly = 0;

    for (const [providerName, list] of [...byProvider.entries()].sort()) {
        // Provider header row
        cells.push([providerName, "", "", "", "", "", ""]);
        const provRowIdx = cells.length - 1;
        formats.push({
            label: `provider-${providerName}`,
            range: sheetRange(tab, provRowIdx, 0, provRowIdx, LAST_COL),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor",
            format: {
                textFormat: { bold: true, fontSize: 11, foregroundColor: INK },
                backgroundColor: BG_PROVIDER,
            },
        });

        // Instance rows
        const firstInstRowIdx = cells.length;
        let providerHourly = 0;
        for (const inst of list) {
            const hourlyUsd = Number(inst.cost_per_hour_usd ?? 0);
            const hourlyEur = hourlyUsd * fx;
            const dailyEur = hourlyEur * HOURS_PER_DAY;
            const monthlyEur = hourlyEur * HOURS_PER_MONTH;
            providerHourly += hourlyEur;
            cells.push([
                "",
                inst.name ?? "",
                inst.gpu ?? "",
                inst.status ?? "",
                Number(hourlyEur.toFixed(2)),
                Number(dailyEur.toFixed(2)),
                Number(monthlyEur.toFixed(2)),
            ]);
        }
        const lastInstRowIdx = cells.length - 1;
        if (lastInstRowIdx >= firstInstRowIdx) {
            formats.push({
                label: `instances-${providerName}`,
                range: sheetRange(
                    tab,
                    firstInstRowIdx,
                    0,
                    lastInstRowIdx,
                    LAST_COL,
                ),
                fields: "userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor",
                format: {
                    textFormat: { fontSize: 10, foregroundColor: INK },
                    backgroundColor: WHITE,
                },
            });
        }

        // Subtotal row
        fleetHourly += providerHourly;
        cells.push([
            "",
            `${providerName} subtotal`,
            "",
            "",
            Number(providerHourly.toFixed(2)),
            Number((providerHourly * HOURS_PER_DAY).toFixed(2)),
            Number((providerHourly * HOURS_PER_MONTH).toFixed(2)),
        ]);
        const subRowIdx = cells.length - 1;
        formats.push({
            label: `subtotal-${providerName}`,
            range: sheetRange(tab, subRowIdx, 0, subRowIdx, LAST_COL),
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
            format: {
                textFormat: { bold: true, fontSize: 10, foregroundColor: INK },
                backgroundColor: BG_SUBTOTAL,
                borders: {
                    top: { style: "SOLID", color: INK_MUTED },
                    bottom: { style: "SOLID", color: INK_MUTED },
                },
            },
        });
    }

    // Fleet-wide total row
    cells.push(["", "", "", "", "", "", ""]);
    cells.push([
        "",
        "FLEET TOTAL",
        "",
        "",
        Number(fleetHourly.toFixed(2)),
        Number((fleetHourly * HOURS_PER_DAY).toFixed(2)),
        Number((fleetHourly * HOURS_PER_MONTH).toFixed(2)),
    ]);
    const totalRowIdx = cells.length - 1;
    formats.push({
        label: "fleetTotal",
        range: sheetRange(tab, totalRowIdx, 0, totalRowIdx, LAST_COL),
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
        format: {
            textFormat: { bold: true, fontSize: 11, foregroundColor: INK },
            backgroundColor: BG_TOTAL,
            borders: {
                top: { style: "SOLID", color: INK },
                bottom: { style: "SOLID", color: INK },
            },
        },
    });

    // Column widths
    const columnWidths = [
        { col: 0, width: 130 }, // Provider
        { col: 1, width: 220 }, // Name
        { col: 2, width: 220 }, // GPU
        { col: 3, width: 100 }, // Status
        { col: 4, width: 100 }, // €/hr
        { col: 5, width: 110 }, // €/day
        { col: 6, width: 120 }, // €/month
    ];

    return {
        cells,
        formats,
        columnWidths,
        freezeRows: headerRowIdx + 1,
        tab,
        // Range that should get EUR number formatting (cols E..G, rows below header)
        numericRange: `${tab}!${colLetter(4)}${headerRowIdx + 2}:${colLetter(LAST_COL)}${cells.length}`,
    };
}
