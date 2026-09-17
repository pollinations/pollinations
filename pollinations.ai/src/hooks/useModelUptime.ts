import {
    fetchModelHealthRows,
    type ModelHealth,
    type ModelHealthRow,
    modelHealthLookup,
} from "@shared/model-health";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";
import type { Model } from "./useModelList";

const CACHE_KEY = "pollinations:modelUptime:24h:v1";
const TTL_MS = 60 * 1000;

const fetchRows = () => fetchModelHealthRows(API_BASE);

export function useModelUptime(
    enabled: boolean,
): (model: Model) => ModelHealth {
    const { data } = useCachedFetch<ModelHealthRow[]>(
        CACHE_KEY,
        fetchRows,
        TTL_MS,
        enabled,
    );
    const lookup = modelHealthLookup(data ?? []);
    return (model: Model) => lookup(model.id, model.type);
}
