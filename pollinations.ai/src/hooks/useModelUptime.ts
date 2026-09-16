import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";
import type { Model } from "./useModelList";

const MODEL_STATUS_URL = `${API_BASE}/v1/models/status?minutes=1440`;

export type UptimeHealth = "healthy" | "degraded" | "down" | "unknown";

export interface UptimeStatus {
    health: UptimeHealth;
    requests: number;
    successRate: number | null;
}

interface ModelHealthRow {
    model?: string;
    event_type?: string;
    status_2xx?: number;
    errors_5xx?: number;
}

interface ModelStatusResponse {
    data?: ModelHealthRow[];
}

const CACHE_KEY = "pollinations:modelUptime:24h:v1";
const TTL_MS = 60 * 1000;

async function fetchRows(): Promise<ModelHealthRow[]> {
    const response = await fetch(MODEL_STATUS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch model status (${response.status})`);
    }
    const body = (await response.json()) as ModelStatusResponse;
    return Array.isArray(body?.data) ? body.data : [];
}

function computeStatus(row: ModelHealthRow | undefined): UptimeStatus {
    const success = row?.status_2xx ?? 0;
    const errors5xx = row?.errors_5xx ?? 0;
    const requests = success + errors5xx;

    if (requests === 0) {
        return { health: "unknown", requests: 0, successRate: null };
    }

    const successRate = (success / requests) * 100;

    const pct5xx = (errors5xx / requests) * 100;
    if (pct5xx >= 50) return { health: "down", requests, successRate };
    if (pct5xx >= 10) return { health: "degraded", requests, successRate };
    return { health: "healthy", requests, successRate };
}

export function useModelUptime(
    enabled: boolean,
): (model: Model) => UptimeStatus {
    const { data } = useCachedFetch<ModelHealthRow[]>(
        CACHE_KEY,
        fetchRows,
        TTL_MS,
        enabled,
    );

    return (model: Model) => {
        const row = data?.find(
            ({ model: id, event_type }) =>
                id === model.id && event_type === `generate.${model.type}`,
        );
        return computeStatus(row);
    };
}
