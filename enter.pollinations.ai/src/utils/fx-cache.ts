// Daily-refresh FX cache for USD -> EUR. Used at Stripe Checkout session
// creation for non-USD cohorts: USD reference price is converted to an EUR
// integration amount, then Stripe Adaptive Pricing localizes EUR -> buyer's
// display currency. Keeps "1 pollen = $1" honest across cohorts.

const FX_KEY_USD_EUR = "fx:usd_eur";
const FX_TTL_SECONDS = 24 * 60 * 60;
const FX_FETCH_TIMEOUT_MS = 5000;

// ECB-published USD/EUR around 2026-Q2. Used only when both KV cache and
// frankfurter.dev are unavailable; refresh occasionally to keep drift low
// during third-party outages.
export const FX_SAFETY_RATE_USD_EUR = 0.93;

type FrankfurterResponse = {
    base?: string;
    date?: string;
    rates?: { EUR?: number };
};

async function fetchUsdToEurFromFrankfurter(): Promise<number | null> {
    try {
        const response = await fetch(
            "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR",
            { signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS) },
        );
        if (!response.ok) return null;
        const data = (await response.json()) as FrankfurterResponse;
        const rate = data?.rates?.EUR;
        if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
            return null;
        }
        return rate;
    } catch (error) {
        console.error("FX fetch from frankfurter.dev failed:", error);
        return null;
    }
}

async function readCachedRate(env: CloudflareBindings): Promise<number | null> {
    try {
        const cached = await env.KV.get(FX_KEY_USD_EUR);
        if (!cached) return null;
        const rate = Number.parseFloat(cached);
        return Number.isFinite(rate) && rate > 0 ? rate : null;
    } catch (error) {
        console.warn("FX KV read failed, falling through to fetch:", error);
        return null;
    }
}

async function writeCachedRate(
    env: CloudflareBindings,
    rate: number,
): Promise<void> {
    try {
        await env.KV.put(FX_KEY_USD_EUR, String(rate), {
            expirationTtl: FX_TTL_SECONDS,
        });
    } catch (error) {
        // KV write failures are non-fatal: we still return the freshly-fetched
        // rate to the caller. Next request just refetches from frankfurter.
        console.warn("FX KV write failed (rate still returned):", error);
    }
}

export async function getUsdToEurRate(
    env: CloudflareBindings,
): Promise<number> {
    const cached = await readCachedRate(env);
    if (cached !== null) return cached;

    const fresh = await fetchUsdToEurFromFrankfurter();
    if (fresh !== null) {
        await writeCachedRate(env, fresh);
        return fresh;
    }

    console.warn(
        `FX cache empty and frankfurter.dev unreachable; using safety rate ${FX_SAFETY_RATE_USD_EUR}`,
    );
    return FX_SAFETY_RATE_USD_EUR;
}
