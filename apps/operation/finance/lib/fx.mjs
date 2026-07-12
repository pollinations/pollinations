/**
 * Live USD→EUR FX rate from the ECB reference rates (via frankfurter.dev).
 *
 * The runway sheet stores a static `usd_to_eur` in config.local.json as a
 * fallback. Rebuild refreshes it from the ECB at run time so the rate never
 * silently goes stale (it once sat at an April rate for months). Any
 * network/parse failure returns null and the caller keeps the config value.
 */

const FRANKFURTER_URL =
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";

/**
 * Parse a frankfurter.dev /latest response into { rate, asOf }.
 * Pure + exported for unit testing. Throws on an unexpected shape.
 *
 * @param {object} json  parsed JSON body
 * @returns {{ rate: number, asOf: string }}
 */
export function parseFrankfurter(json) {
    const rate = json?.rates?.EUR;
    if (json?.base !== "USD" || typeof rate !== "number" || !json?.date) {
        throw new Error("unexpected frankfurter response shape");
    }
    return { rate, asOf: json.date };
}

/**
 * Fetch the live USD→EUR rate. Returns { rate, asOf } or null on any failure
 * (offline, non-200, malformed body) so callers can fall back to config.
 *
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ rate: number, asOf: string } | null>}
 */
export async function fetchUsdToEur({ timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(FRANKFURTER_URL, { signal: controller.signal });
        if (!res.ok) return null;
        return parseFrankfurter(await res.json());
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
