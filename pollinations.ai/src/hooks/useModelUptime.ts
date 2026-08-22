import { useMemo } from "react";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";
import type { Model } from "./useModelList";

// Rolling-window uptime for community models, sourced from the same
// `/v1/models/status` endpoint that powers https://model-monitor.pollinations.ai.
// See proposal: "community model uptime dots in the model picker".
const MODEL_STATUS_URL = `${API_BASE}/v1/models/status`;

export type UptimeWindowKey = "1h" | "24h" | "7d";

export type UptimeHealth = "healthy" | "degraded" | "down" | "unknown";

export interface UptimeWindow {
    key: UptimeWindowKey;
    minutes: number;
    label: string;
}

export interface UptimeWindowStatus extends UptimeWindow {
    health: UptimeHealth;
    /** Non-client-error (2xx + 5xx) requests observed in this window. */
    requests: number;
    successRate: number | null;
}

// Three rolling windows tell a story a single number can't: e.g.
// healthy -> degraded -> down means "just went down"; the reverse means
// "recently recovered".
export const UPTIME_WINDOWS: UptimeWindow[] = [
    { key: "1h", minutes: 60, label: "1 hour" },
    { key: "24h", minutes: 1440, label: "24 hours" },
    { key: "7d", minutes: 10080, label: "7 days" },
];

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

type WindowRows = Record<UptimeWindowKey, ModelHealthRow[]>;

const CACHE_KEY = "pollinations:modelUptime:v1";
// Matches the server-side cache TTL on /v1/models/status - polling more
// often than this would only ever return the same cached response.
const TTL_MS = 60 * 1000;

async function fetchWindowRows(minutes: number): Promise<ModelHealthRow[]> {
    const response = await fetch(`${MODEL_STATUS_URL}?minutes=${minutes}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch model status (${response.status})`);
    }
    const body = (await response.json()) as ModelStatusResponse;
    return Array.isArray(body?.data) ? body.data : [];
}

async function fetchAllWindows(): Promise<WindowRows> {
    const rows = await Promise.all(
        UPTIME_WINDOWS.map((w) => fetchWindowRows(w.minutes)),
    );
    return UPTIME_WINDOWS.reduce((acc, w, i) => {
        acc[w.key] = rows[i];
        return acc;
    }, {} as WindowRows);
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

function computeStatus(
    window: UptimeWindow,
    row: ModelHealthRow | undefined,
): UptimeWindowStatus {
    const success = row?.status_2xx ?? 0;
    const errors5xx = row?.errors_5xx ?? 0;
    // 4xx are client errors (bad requests) and don't reflect the model's
    // own health, so they're excluded from both the sample count and the
    // success rate - same convention as the model-monitor dashboard.
    const requests = success + errors5xx;

    if (requests === 0) {
        return { ...window, health: "unknown", requests: 0, successRate: null };
    }

    const successRate = (success / requests) * 100;

    if (requests < MIN_SAMPLE_REQUESTS) {
        return { ...window, health: "unknown", requests, successRate };
    }

    const pct5xx = (errors5xx / requests) * 100;
    if (pct5xx >= 50)
        return { ...window, health: "down", requests, successRate };
    if (pct5xx >= 10)
        return { ...window, health: "degraded", requests, successRate };
    return { ...window, health: "healthy", requests, successRate };
}

interface UseModelUptimeReturn {
    /** Per-window uptime status for a model, oldest-window-first is not assumed - order matches UPTIME_WINDOWS. */
    getUptime: (model: Model) => UptimeWindowStatus[];
    isLoading: boolean;
}

/**
 * Fetches rolling 1h / 24h / 7d uptime for all models in three requests
 * (independent of how many community models are shown), and exposes a
 * lookup for per-model status. Only enable this for views that actually
 * render community models - official models don't show uptime dots.
 */
export function useModelUptime(enabled: boolean): UseModelUptimeReturn {
    const { data, loading } = useCachedFetch<WindowRows>(
        CACHE_KEY,
        fetchAllWindows,
        TTL_MS,
        enabled,
    );

    const getUptime = useMemo(() => {
        return (model: Model): UptimeWindowStatus[] =>
            UPTIME_WINDOWS.map((window) =>
                computeStatus(window, findRow(data?.[window.key], model)),
            );
    }, [data]);

    return { getUptime, isLoading: enabled && loading };
}
