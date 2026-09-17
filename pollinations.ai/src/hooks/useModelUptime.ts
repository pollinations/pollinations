import {
    MODEL_HEALTH_WINDOW_MINUTES,
    type ModelHealth,
    type ModelHealthRow,
    modelHealthFromRow,
    modelHealthKey,
    modelHealthRollups,
} from "@shared/model-health";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";
import type { Model } from "./useModelList";

const MODEL_STATUS_URL = `${API_BASE}/models/status?minutes=${MODEL_HEALTH_WINDOW_MINUTES}`;

const CACHE_KEY = "pollinations:modelUptime:24h:v1";
const TTL_MS = 60 * 1000;

async function fetchRows(): Promise<ModelHealthRow[]> {
    const response = await fetch(MODEL_STATUS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch model status (${response.status})`);
    }
    const body = (await response.json()) as { data?: ModelHealthRow[] };
    return body?.data ?? [];
}

export function useModelUptime(
    enabled: boolean,
): (model: Model) => ModelHealth {
    const { data } = useCachedFetch<ModelHealthRow[]>(
        CACHE_KEY,
        fetchRows,
        TTL_MS,
        enabled,
    );
    const rollups = modelHealthRollups(data ?? []);

    return (model: Model) =>
        modelHealthFromRow(
            rollups.get(modelHealthKey(model.id, `generate.${model.type}`)),
        );
}
