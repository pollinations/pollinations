/**
 * Convert raw CSV rows into canonical rows using a vendors.json alias map.
 *
 * Canonical row shape:
 *   { date: "YYYY-MM-DD", month: "YYYY-MM", vendor, category, amount }
 *
 * Returns { canonical, unknown }:
 *   - canonical: array of rows whose raw counterparty was found in the alias map
 *   - unknown: deduped array of raw counterparties NOT found in the alias map
 *
 * This function is pure: it does not prompt, read files, or mutate inputs.
 * The caller is responsible for handling unknowns (typically by prompting the
 * user and re-running normalize with an updated map).
 */
export function normalize(rawRows, vendorsMap) {
    const canonical = [];
    const unknownSet = new Set();
    for (const r of rawRows) {
        const key = r.counterparty;
        const entry = vendorsMap[key];
        if (!entry) {
            unknownSet.add(key);
            continue;
        }
        canonical.push({
            date: r.date,
            month: r.date.slice(0, 7),
            vendor: entry.canonical,
            category: entry.category,
            amount: r.amount_eur,
        });
    }
    return { canonical, unknown: [...unknownSet] };
}
