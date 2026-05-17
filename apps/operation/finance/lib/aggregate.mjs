/**
 * Aggregate canonical rows into a matrix.
 *
 * Input: array of { date, month, vendor, category, amount }
 * Output: {
 *   months: string[] (sorted ascending, e.g. ["2025-01", "2025-02"]),
 *   vendors: { [vendorName]: categoryName } (unique vendor → category),
 *   data: { [month]: { [vendor]: number } } (summed amounts, 0 for missing combos)
 * }
 *
 * Pure. Does not mutate input.
 */
export function aggregate(rows) {
    const monthsSet = new Set();
    const vendors = {};
    const data = {};

    for (const r of rows) {
        monthsSet.add(r.month);
        vendors[r.vendor] = r.category;
        if (!data[r.month]) data[r.month] = {};
        data[r.month][r.vendor] = (data[r.month][r.vendor] ?? 0) + r.amount;
    }

    const months = [...monthsSet].sort();

    // Fill zero cells for every (month, vendor) combo that has no transaction
    for (const month of months) {
        for (const vendor of Object.keys(vendors)) {
            if (data[month][vendor] === undefined) data[month][vendor] = 0;
        }
    }

    return { months, vendors, data };
}
