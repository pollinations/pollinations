/**
 * Convert raw CSV rows into canonical rows using a vendors.json alias map.
 *
 * Canonical row shape:
 *   { date: "YYYY-MM-DD", month: "YYYY-MM", vendor, category, amount }
 *
 * Returns { canonical, unknown, unknownStats }:
 *   - canonical: array of rows whose raw counterparty was found in the alias map
 *   - unknown: deduped array of raw counterparties NOT found in the alias map
 *   - unknownStats: array of { counterparty, count, sumEur } sorted by
 *     descending |sumEur|. Useful for warning/alert output.
 *
 * This function is pure: it does not prompt, read files, or mutate inputs.
 * The caller is responsible for handling unknowns (typically by prompting the
 * user and re-running normalize with an updated map).
 */
export function normalize(rawRows, vendorsMap) {
    const canonical = [];
    const unknownSet = new Set();
    const stats = new Map();
    for (const r of rawRows) {
        const key = r.counterparty;
        const entry = vendorsMap[key];
        if (!entry) {
            unknownSet.add(key);
            const s = stats.get(key) ?? { count: 0, sumEur: 0 };
            s.count += 1;
            s.sumEur += r.amount_eur ?? 0;
            stats.set(key, s);
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
    const unknownStats = [...stats.entries()]
        .map(([counterparty, s]) => ({
            counterparty,
            count: s.count,
            sumEur: Number(s.sumEur.toFixed(2)),
        }))
        .sort((a, b) => Math.abs(b.sumEur) - Math.abs(a.sumEur));
    return { canonical, unknown: [...unknownSet], unknownStats };
}
