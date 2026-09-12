import debug from "debug";
import { z } from "zod";

const log = debug("pollinations:model-health");

// Public Tinybird pipe — same source as GET /v1/models/status
// (see src/routes/model-status.ts, which owns the canonical fetcher).
// Mirrored here so model listings can attach minimal health metadata
// without coupling the discovery path to the monitor route.
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 16;
export const DEFAULT_HEALTH_WINDOW_MINUTES = 60;

const HealthRowSchema = z.object({
    model: z.string(),
    event_type: z.string(),
    status_2xx: z.number().int().nonnegative().catch(0),
    errors_4xx: z.number().int().nonnegative().catch(0),
    errors_5xx: z.number().int().nonnegative().catch(0),
    fallback_rescues: z.number().int().nonnegative().catch(0),
});

export type HealthRow = z.infer<typeof HealthRowSchema>;

export type ModelHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type ModelHealth = {
    /** 0–1 share of reliability-sample requests that succeeded, null when unknown. */
    success_rate: number | null;
    /** Reliability sample size: 2xx + 5xx (caller-side 4xx excluded). */
    sample_count: number;
    window_minutes: number;
    fetched_at: string;
    status: ModelHealthStatus;
    stale?: boolean;
};

type CacheEntry = {
    rows: HealthRow[];
    fetchedAt: number;
};

const cache = new Map<number, CacheEntry>();

function setCacheEntry(minutes: number, entry: CacheEntry) {
    cache.delete(minutes);
    cache.set(minutes, entry);
    if (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

type Aggregated = { success: number; errors5xx: number };

function aggregateRows(rows: HealthRow[]): Map<string, Aggregated> {
    const map = new Map<string, Aggregated>();
    for (const row of rows) {
        const key = healthKey(row.model, row.event_type);
        const current = map.get(key) ?? { success: 0, errors5xx: 0 };
        // status_2xx already includes fallback-rescued requests: per quest,
        // fallback rescues count as successes (no double-counting).
        current.success += row.status_2xx;
        current.errors5xx += row.errors_5xx;
        map.set(key, current);
    }
    return map;
}

/**
 * Dashboard semantics, reused from the Enter/play UI (useModelUptime):
 * match on model id + event type, success = 2xx (rescues included),
 * caller-side 4xx excluded, missing data means unknown. Experimental
 * (alpha) status is orthogonal and never folded into reliability.
 */
export function computeModelHealth(
    row: { success: number; errors5xx: number } | undefined,
    windowMinutes: number,
    fetchedAt: string,
    stale = false,
): ModelHealth {
    const success = row?.success ?? 0;
    const errors5xx = row?.errors5xx ?? 0;
    const sampleCount = success + errors5xx;
    if (sampleCount === 0) {
        return {
            success_rate: null,
            sample_count: 0,
            window_minutes: windowMinutes,
            fetched_at: fetchedAt,
            status: "unknown",
            ...(stale && { stale: true }),
        };
    }
    const successRate = success / sampleCount;
    const pct5xx = (errors5xx / sampleCount) * 100;
    const status: ModelHealthStatus =
        pct5xx >= 50 ? "down" : pct5xx >= 10 ? "degraded" : "healthy";
    return {
        success_rate: successRate,
        sample_count: sampleCount,
        window_minutes: windowMinutes,
        fetched_at: fetchedAt,
        status,
        ...(stale && { stale: true }),
    };
}

export async function getModelHealthMap(
    minutes: number,
    fetchImpl: typeof fetch = fetch,
): Promise<{ map: Map<string, Aggregated>; fetchedAt: string; stale: boolean }> {
    const windowMinutes =
        Number.isInteger(minutes) && minutes >= 1 && minutes <= 10080
            ? minutes
            : DEFAULT_HEALTH_WINDOW_MINUTES;
    const now = Date.now();
    const cached = cache.get(windowMinutes);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        setCacheEntry(windowMinutes, cached);
        return {
            map: aggregateRows(cached.rows),
            fetchedAt: new Date(cached.fetchedAt).toISOString(),
            stale: false,
        };
    }
    try {
        const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
        url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
        url.searchParams.set("minutes", String(windowMinutes));
        const response = await fetchImpl(url.toString());
        if (!response.ok) throw new Error(`Tinybird ${response.status}`);
        const body = (await response.json()) as { data?: unknown[] };
        const rows: HealthRow[] = [];
        for (const item of body.data ?? []) {
            const parsed = HealthRowSchema.safeParse(item);
            if (parsed.success) rows.push(parsed.data);
        }
        const fetchedAt = Date.now();
        setCacheEntry(windowMinutes, { rows, fetchedAt });
        return {
            map: aggregateRows(rows),
            fetchedAt: new Date(fetchedAt).toISOString(),
            stale: false,
        };
    } catch (error) {
        log("Model health fetch failed: %O", error);
        if (cached) {
            setCacheEntry(windowMinutes, cached);
            return {
                map: aggregateRows(cached.rows),
                fetchedAt: new Date(cached.fetchedAt).toISOString(),
                stale: true,
            };
        }
        return {
            map: new Map(),
            fetchedAt: new Date(now).toISOString(),
            stale: false,
        };
    }
}

export function healthKey(modelId: string, eventType: string): string {
    return `${modelId}::${eventType}`;
}

// Header names for clients (Open WebUI, LibreChat, Cline) that append
// `/models` to the configured base URL, which breaks embedded query strings.
// Custom headers pass through untouched; query params take precedence.
export const MODEL_SOURCE_HEADER = "x-pollinations-source";
export const MODEL_INCLUDE_HEALTH_HEADER = "x-pollinations-include-health";
export const MODEL_HEALTH_WINDOW_HEADER = "x-pollinations-health-window";
export const MODEL_MIN_SUCCESS_RATE_HEADER =
    "x-pollinations-min-success-rate";

export type ResolvedModelListOptions = {
    source: "official" | "community" | "all";
    includeHealth: boolean;
    healthWindow: number;
    minSuccessRate: number | undefined;
};

function parseBooleanHeader(value: string | null): boolean | undefined {
    if (value === null) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    return undefined;
}

/**
 * Merge query params (preferred) with header fallbacks. Returns a 400 message
 * when values conflict or are invalid, otherwise the resolved options.
 */
export function resolveModelListOptions(
    query: {
        community?: string;
        source?: string;
        include_health?: string;
        health_window?: number;
        min_success_rate?: number;
    },
    headers: Headers,
): { ok: true; options: ResolvedModelListOptions } | { ok: false; error: string } {
    const headerSource = headers.get(MODEL_SOURCE_HEADER)?.trim().toLowerCase();
    if (
        headerSource !== undefined &&
        headerSource !== null &&
        headerSource !== "" &&
        !["official", "community", "all"].includes(headerSource)
    ) {
        return {
            ok: false,
            error: `Invalid ${MODEL_SOURCE_HEADER} header: expected official, community, or all`,
        };
    }
    const source = (query.source ??
        (headerSource || undefined) ??
        "all") as "official" | "community" | "all";

    // Deprecated `community` alias must agree with `source` when both are set.
    if (query.community !== undefined) {
        const wantCommunity =
            query.community === "true" || query.community === "1";
        const implied = wantCommunity ? "community" : "official";
        if (query.source !== undefined && query.source !== implied) {
            return {
                ok: false,
                error: "Conflicting filters: `source` and `community` disagree; use `source` (official|community|all).",
            };
        }
        if (query.source === undefined && headerSource && headerSource !== implied && headerSource !== "all") {
            return {
                ok: false,
                error: `Conflicting filters: \`community\` and \`${MODEL_SOURCE_HEADER}\` disagree; use one source filter.`,
            };
        }
        if (query.source === undefined && (!headerSource || headerSource === "all")) {
            return {
                ok: true,
                options: {
                    ...resolveHealthOptions(query, headers),
                    source: implied,
                },
            };
        }
    }
    const health = resolveHealthOptions(query, headers);
    if (!health.ok) return health;
    return { ok: true, options: { ...health.options, source } };
}

function resolveHealthOptions(
    query: {
        include_health?: string;
        health_window?: number;
        min_success_rate?: number;
    },
    headers: Headers,
): { ok: true; options: Omit<ResolvedModelListOptions, "source"> } | { ok: false; error: string } {
    const headerInclude = parseBooleanHeader(
        headers.get(MODEL_INCLUDE_HEALTH_HEADER),
    );
    if (
        headers.get(MODEL_INCLUDE_HEALTH_HEADER) !== null &&
        headerInclude === undefined
    ) {
        return {
            ok: false,
            error: `Invalid ${MODEL_INCLUDE_HEALTH_HEADER} header: expected true, false, 1, or 0`,
        };
    }
    const includeHealth =
        query.include_health !== undefined
            ? query.include_health === "true" || query.include_health === "1"
            : (headerInclude ?? false);

    const headerWindowRaw = headers.get(MODEL_HEALTH_WINDOW_HEADER);
    let headerWindow: number | undefined;
    if (headerWindowRaw !== null) {
        headerWindow = Number(headerWindowRaw);
        if (!Number.isInteger(headerWindow) || headerWindow < 1 || headerWindow > 10080) {
            return {
                ok: false,
                error: `Invalid ${MODEL_HEALTH_WINDOW_HEADER} header: expected an integer between 1 and 10080`,
            };
        }
    }
    const healthWindow = query.health_window ?? headerWindow ?? DEFAULT_HEALTH_WINDOW_MINUTES;

    const headerRateRaw = headers.get(MODEL_MIN_SUCCESS_RATE_HEADER);
    let headerRate: number | undefined;
    if (headerRateRaw !== null) {
        headerRate = Number(headerRateRaw);
        if (!Number.isFinite(headerRate) || headerRate < 0 || headerRate > 1) {
            return {
                ok: false,
                error: `Invalid ${MODEL_MIN_SUCCESS_RATE_HEADER} header: expected a number between 0 and 1`,
            };
        }
    }
    const minSuccessRate = query.min_success_rate ?? headerRate;

    return { ok: true, options: { includeHealth, healthWindow, minSuccessRate } };
}

export function filterEntriesBySource<T extends { communityEndpoint?: unknown }>(
    entries: T[],
    source: "official" | "community" | "all",
): T[] {
    if (source === "all") return entries;
    const wantCommunity = source === "community";
    return entries.filter(
        (entry) => (entry.communityEndpoint !== undefined) === wantCommunity,
    );
}
