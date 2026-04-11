/**
 * Extend an aggregate matrix with N future months based on per-vendor forecast rules.
 *
 * Input:
 *   matrix        — { months, vendors, data } from aggregate()
 *   vendorRules   — raw vendors.json map (keys are raw counterparty names, values have `canonical` and `forecast`)
 *   forecastCount — number of future months to add
 *
 * Output (extended matrix):
 *   months          — original months + N future months
 *   vendors         — unchanged
 *   data            — extended with forecast values for the new months
 *   forecastMonths  — Set of month strings that are forecast (not actual)
 *   liveCells       — Set of "month|vendor" keys that were flagged `"live"` (v2 will fill these)
 *
 * Rules:
 *   number       → copy that number to every future month
 *   "avg3"       → average of last 3 actual months for that vendor
 *   "last"       → last actual month's value for that vendor
 *   "none"       → 0 in every future month
 *   "live"       → v1 fallback: same as avg3, but the cell is marked in liveCells
 *
 * Pure. Does not mutate input. Does not mutate vendorRules.
 */

export function nextMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRuleIndexByCanonical(vendorRules) {
    // Map canonical vendor name → forecast rule. If two raw entries map to the same
    // canonical, last one wins (they should agree; this is documented behavior).
    const out = {};
    for (const [key, entry] of Object.entries(vendorRules)) {
        // Keys starting with "_" are config metadata (e.g. "_pools"), not vendors.
        if (key.startsWith("_")) continue;
        out[entry.canonical] = entry.forecast;
    }
    return out;
}

function avg3(matrix, vendor) {
    const lastThree = matrix.months.slice(-3);
    if (lastThree.length === 0) return 0;
    const sum = lastThree.reduce(
        (s, m) => s + (matrix.data[m][vendor] ?? 0),
        0,
    );
    return sum / lastThree.length;
}

function lastMonthValue(matrix, vendor) {
    const last = matrix.months.at(-1);
    if (!last) return 0;
    return matrix.data[last][vendor] ?? 0;
}

function forecastValue(rule, matrix, vendor) {
    if (typeof rule === "number") return rule;
    if (rule === "avg3") return avg3(matrix, vendor);
    if (rule === "last") return lastMonthValue(matrix, vendor);
    if (rule === "none") return 0;
    if (rule === "live") return avg3(matrix, vendor); // v1 fallback
    return 0; // unknown rule → zero
}

export function forecast(matrix, vendorRules, forecastCount) {
    const ruleByCanonical = buildRuleIndexByCanonical(vendorRules);
    const months = [...matrix.months];
    const data = {};
    for (const m of months) data[m] = { ...matrix.data[m] };

    const forecastMonths = new Set();
    const liveCells = new Set();

    let cursor = months.at(-1);
    for (let i = 0; i < forecastCount; i++) {
        cursor = nextMonth(cursor);
        months.push(cursor);
        forecastMonths.add(cursor);
        data[cursor] = {};
        for (const vendor of Object.keys(matrix.vendors)) {
            const rule = ruleByCanonical[vendor];
            data[cursor][vendor] =
                rule === undefined ? 0 : forecastValue(rule, matrix, vendor);
            if (rule === "live") liveCells.add(`${cursor}|${vendor}`);
        }
    }

    return { months, vendors: matrix.vendors, data, forecastMonths, liveCells };
}
