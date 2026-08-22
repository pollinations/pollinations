import { useMemo } from "react";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";
import type { Model } from "./useModelList";

// 24h rolling uptime for community models, sourced from the same
// `/v1/models/status` endpoint that powers https://model-monitor.pollinations.ai.
// See proposal: "community model uptime dots in the model picker".
const MODEL_STATUS_URL = `${API_BASE}/v1/models/status`;
const WINDOW_MINUTES = 1440;

export type UptimeHealth = "healthy" | "degraded" | "down" | "unknown";

export interface UptimeStatus {
    health: UptimeHealth;
    /** Non-client-error (2xx + 5xx) requests observed in the window. */
    requests: number;
    successRate: number | null;
}

// A dot only renders a verdict once a model has cleared this many
// non-client-error requests in the window. Below that, a single failed
// request would wrongly paint a healthy low-traffic model red, and a
// handful of successes would wrongly vouch for a barely-tested one.
const MIN_SAMPLE_REQUESTS = 20;

interface ModelHealthRow {
    model?: string;
    event_type?: string;
    total_requests?: number;
    status_2xx?: number;
    errors_4xx?: number;
    errors_5xx?: number;
}

interface ModelStatusResponse {
    data?: ModelHealthRow[];
}

const CACHE_KEY = "pollinations:modelUptime:24h:v1";
// Matches the server-side cache TTL on /v1/models/status - polling more
// often than this would only ever return the same cached response.
const TTL_MS = 60 * 1000;

async function fetchRows(): Promise<ModelHealthRow[]> {
    const response = await fetch(
        `${MODEL_STATUS_URL}?minutes=${WINDOW_MINUTES}`,
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch model status (${response.status})`);
    }
    const body = (await response.json()) as ModelStatusResponse;
    return Array.isArray(body?.data) ? body.data : [];
}

/** Mirrors gen.pollinations.ai/model-monitor's Tinybird event_type naming. */
function eventTypeForModel(model: Model): string {
    if (model.hasVideoOutput) return "generate.video";
    return `generate.${model.type}`;
}

function findRow(
    rows: ModelHealthRow[] | undefined,
    model: Model,
): ModelHealthRow | undefined {
    if (!rows) return undefined;
    const eventType = eventTypeForModel(model);
    return rows.find(
        (row) => row.model === model.id && row.event_type === eventType,
    );
}

function computeStatus(row: ModelHealthRow | undefined): UptimeStatus {
    const success = row?.status_2xx ?? 0;
    const errors5xx = row?.errors_5xx ?? 0;
    // 4xx are client errors (bad requests) and don't reflect the model's
    // own health, so they're excluded from both the sample count and the
    // success rate - same convention as the model-monitor dashboard.
    const requests = success + errors5xx;

    if (requests === 0) {
        return { health: "unknown", requests: 0, successRate: null };
    }

    const successRate = (success / requests) * 100;

    if (requests < MIN_SAMPLE_REQUESTS) {
        return { health: "unknown", requests, successRate };
    }

    const pct5xx = (errors5xx / requests) * 100;
    if (pct5xx >= 50) return { health: "down", requests, successRate };
    if (pct5xx >= 10) return { health: "degraded", requests, successRate };
    return { health: "healthy", requests, successRate };
}

interface UseModelUptimeReturn {
    getUptime: (model: Model) => UptimeStatus;
    isLoading: boolean;
}

/**
 * Fetches 24h rolling uptime for all models in a single request, and
 * exposes a lookup for per-model status. Only enable this for views that
 * actually render community models - official models don't show an
 * uptime dot.
 */
export function useModelUptime(enabled: boolean): UseModelUptimeReturn {
    const { data, loading } = useCachedFetch<ModelHealthRow[]>(
        CACHE_KEY,
        fetchRows,
        TTL_MS,
        enabled,
    );

    const getUptime = useMemo(() => {
        return (model: Model): UptimeStatus =>
            computeStatus(findRow(data ?? undefined, model));
    }, [data]);

    return { getUptime, isLoading: enabled && loading };
}
