// Remove hardcoded token; use environment variable or fallback to authenticated endpoint
import { gen } from "../lib/api.js";
import { printError } from "../lib/output.js";

const STATS_TOKEN = process.env.POLLINATIONS_STATS_TOKEN;

export async function fetchModelStats(
    minutes = 60,
): Promise<Record<string, unknown>[]> {
    // Try authenticated endpoint first if token available
    if (STATS_TOKEN) {
        try {
            const url = `https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=${STATS_TOKEN}&minutes=${minutes}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                const { data } = (await res.json()) as { data: Record<string, unknown>[] };
                return data;
            }
        } catch {
            // fall through to fallback
        }
    }

    // Fallback: try to get stats via authenticated API (if available)
    try {
        const data = await gen<{ data: Record<string, unknown>[] }>("/stats/models", {
            retry: true,
        });
        if (data && data.data) {
            return data.data;
        }
    } catch {
        // fall through
    }

    // If all else fails, return empty array with a warning
    printError("No stats token configured. Set POLLINATIONS_STATS_TOKEN or use authenticated endpoint.");
    return [];
}