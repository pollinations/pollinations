import type { ModelHealth } from "@shared/registry/model-health.ts";
import { modelHealthFromCounts } from "@shared/registry/model-health.ts";
import debug from "debug";
import { z } from "zod";

const log = debug("pollinations:model-health");

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6IGdjcC1ldXJvcGUtd2VzdDIifQ.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;

const HealthRowSchema = z.object({
    model: z.string(),
    status_2xx: z.number().int().nonnegative(),
    errors_4xx: z.number().int().nonnegative(),
    errors_5xx: z.number().int().nonnegative(),
    fallback_rescues: z.number().int().nonnegative(),
    last_request_at: z.string(),
});

const HealthResponseSchema = z.object({
    data: z.array(HealthRowSchema),
});

type HealthRow = z.infer<typeof HealthRowSchema>;

const WINDOW_MINUTES = 24 * 60;

let cache: {
    data: Map<string, HealthRow>;
    timestamp: number;
    stale: boolean;
} | null = null;

export async function getModelHealthMap(): Promise<Map<
    string,
    ModelHealth
> | null> {
    const now = Date.now();
    if (cache && now - cache.timestamp < CACHE_TTL_MS) {
        return buildHealthMap(cache.data, cache.stale);
    }

    try {
        const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
        url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
        url.searchParams.set("minutes", String(WINDOW_MINUTES));
        log("Fetching model health from Tinybird: %s", url.toString());

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Tinybird responded with ${response.status}`);
        }

        const parsed = HealthResponseSchema.parse(await response.json());
        const rowMap = new Map<string, HealthRow>();
        for (const row of parsed.data) {
            rowMap.set(row.model, row);
        }
        cache = { data: rowMap, timestamp: now, stale: false };
        return buildHealthMap(rowMap, false);
    } catch (error) {
        log("Error fetching model health: %O", error);
        if (cache) {
            cache.stale = true;
            return buildHealthMap(cache.data, true);
        }
        return null;
    }
}

function buildHealthMap(
    rows: Map<string, HealthRow>,
    stale: boolean,
): Map<string, ModelHealth> {
    const result = new Map<string, ModelHealth>();
    for (const [model, row] of rows) {
        const successes = row.status_2xx + row.fallback_rescues;
        const failures = row.errors_5xx;
        result.set(
            model,
            modelHealthFromCounts(
                successes,
                failures,
                WINDOW_MINUTES,
                Date.now(),
                stale,
            ),
        );
    }
    return result;
}
