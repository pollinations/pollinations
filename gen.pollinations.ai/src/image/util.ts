export async function sleep(ms: number) {
    await new Promise<void>((resolve, _) => setTimeout(resolve, ms));
}

/**
 * The single wall-clock ceiling every provider poller must respect.
 *
 * It exists because the single-flight lease in the media cache has to outlive
 * the slowest generation it guards: if a lease expires while its holder is
 * still polling, a second caller starts a duplicate paid generation. One
 * shared budget keeps that relationship checkable instead of spread across
 * six unrelated attempt counters.
 *
 * Kept below LEASE_TTL_MS so lease expiry can never race a live poller.
 */
export const GENERATION_BUDGET_MINUTES = 9;
export const GENERATION_BUDGET_MS = GENERATION_BUDGET_MINUTES * 60 * 1000;

// Strip control characters while preserving valid Unicode characters.
export function sanitizeString(str: string) {
    if (!str) return str;
    // biome-ignore lint/suspicious: this is ok
    return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
}
