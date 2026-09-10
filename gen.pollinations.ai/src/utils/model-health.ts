import type { ModelHealth } from "@shared/schemas/openai.ts";
import debug from "debug";

const log = debug("pollinations:model-health");

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;
const DEFAULT_WINDOW_MINUTES = 60;

export type RawHealthRow = {
    model: string;
    total_requests: number;
    status_2xx: number;
    errors_4xx: number;
    errors_5xx: number;
    last_request_at?: string;
    last_error_at?: string;
};

type CachedHealthData = {
    healthMap: Map<string, ModelHealth>;
    timestamp: number;
};

let cachedHealth: CachedHealthData | null = null;

export async function fetchModelHealthMap(
    minutes: number = DEFAULT_WINDOW_MINUTES,
    fetchFn: typeof fetch = fetch,
): Promise<Map<string, ModelHealth>> {
    const now = Date.now();
    if (cachedHealth && now - cachedHealth.timestamp < CACHE_TTL_MS) {
        return cachedHealth.healthMap;
    }

    const healthMap = new Map<string, ModelHealth>();

    try {
        const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
        url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
        url.searchParams.set("minutes", String(minutes));

        const res = await fetchFn(url.toString());
        if (res.ok) {
            const body = (await res.json()) as { data?: RawHealthRow[] };
            if (Array.isArray(body.data)) {
                processHealthRows(body.data, minutes, healthMap);
            }
        }
    } catch (err) {
        log("Failed to fetch model health from Tinybird: %O", err);
    }

    cachedHealth = { healthMap, timestamp: now };
    return healthMap;
}

export function processHealthRows(
    rows: RawHealthRow[],
    windowMinutes: number,
    outMap: Map<string, ModelHealth>,
): void {
    // Group rows by model
    const aggregated = new Map<
        string,
        {
            status_2xx: number;
            errors_5xx: number;
            last_request_at: string | null;
        }
    >();

    for (const row of rows) {
        if (!row.model) continue;
        const existing = aggregated.get(row.model) || {
            status_2xx: 0,
            errors_5xx: 0,
            last_request_at: null,
        };

        existing.status_2xx += row.status_2xx ?? 0;
        existing.errors_5xx += row.errors_5xx ?? 0;

        if (row.last_request_at) {
            if (
                !existing.last_request_at ||
                row.last_request_at > existing.last_request_at
            ) {
                existing.last_request_at = row.last_request_at;
            }
        }

        aggregated.set(row.model, existing);
    }

    for (const [modelId, stats] of aggregated.entries()) {
        const sampleCount = stats.status_2xx + stats.errors_5xx;
        const successRate =
            sampleCount > 0 ? stats.status_2xx / sampleCount : null;

        outMap.set(modelId, {
            success_rate:
                successRate !== null
                    ? Math.round(successRate * 10000) / 10000
                    : null,
            sample_count: sampleCount,
            window_minutes: windowMinutes,
            freshness: stats.last_request_at,
        });
    }
}
