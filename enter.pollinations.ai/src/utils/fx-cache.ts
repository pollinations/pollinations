// Daily-refresh FX cache for USD -> {EUR, INR, GBP}. Used at Stripe Checkout
// session creation for non-USD cohorts: USD reference price is converted to
// the integration currency, then (for cohorts with AP on) Stripe Adaptive
// Pricing localizes to the buyer's display currency. Keeps "1 pollen = $1"
// honest across cohorts.

export type FxTargetCurrency = "eur" | "inr" | "gbp";

const FX_TTL_SECONDS = 24 * 60 * 60;
const FX_FETCH_TIMEOUT_MS = 5000;

// ECB-published rates around 2026-Q2. Used only when both KV cache and
// frankfurter.dev are unavailable; refresh occasionally to keep drift low
// during third-party outages.
export const FX_SAFETY_RATES: Record<FxTargetCurrency, number> = {
    eur: 0.93,
    inr: 85.0,
    gbp: 0.79,
};

type FrankfurterResponse = {
    base?: string;
    date?: string;
    rates?: Record<string, number | undefined>;
};

const cacheKey = (target: FxTargetCurrency): string => `fx:usd_${target}`;

async function fetchUsdToRateFromFrankfurter(
    target: FxTargetCurrency,
): Promise<number | null> {
    const upper = target.toUpperCase();
    try {
        const response = await fetch(
            `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${upper}`,
            { signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS) },
        );
        if (!response.ok) return null;
        const data = (await response.json()) as FrankfurterResponse;
        const rate = data?.rates?.[upper];
        if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
            return null;
        }
        return rate;
    } catch (error) {
        console.error(
            `FX fetch from frankfurter.dev (USD→${upper}) failed:`,
            error,
        );
        return null;
    }
}

async function readCachedRate(
    env: CloudflareBindings,
    target: FxTargetCurrency,
): Promise<number | null> {
    try {
        const cached = await env.KV.get(cacheKey(target));
        if (!cached) return null;
        const rate = Number.parseFloat(cached);
        return Number.isFinite(rate) && rate > 0 ? rate : null;
    } catch (error) {
        console.warn(
            `FX KV read failed for ${cacheKey(target)}, falling through to fetch:`,
            error,
        );
        return null;
    }
}

async function writeCachedRate(
    env: CloudflareBindings,
    target: FxTargetCurrency,
    rate: number,
): Promise<void> {
    try {
        await env.KV.put(cacheKey(target), String(rate), {
            expirationTtl: FX_TTL_SECONDS,
        });
    } catch (error) {
        // KV write failures are non-fatal: we still return the freshly-fetched
        // rate to the caller. Next request just refetches from frankfurter.
        console.warn(
            `FX KV write for ${cacheKey(target)} failed (rate still returned):`,
            error,
        );
    }
}

export async function getUsdToRate(
    env: CloudflareBindings,
    target: FxTargetCurrency,
): Promise<number> {
    const cached = await readCachedRate(env, target);
    if (cached !== null) return cached;

    const fresh = await fetchUsdToRateFromFrankfurter(target);
    if (fresh !== null) {
        await writeCachedRate(env, target, fresh);
        return fresh;
    }

    const safety = FX_SAFETY_RATES[target];
    console.warn(
        `FX cache empty and frankfurter.dev unreachable for USD→${target.toUpperCase()}; using safety rate ${safety}`,
    );
    return safety;
}
