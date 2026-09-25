import { useCallback, useEffect, useMemo, useState } from "react";
import {
    attachRouteHealth,
    mergeModelHealth,
    normalizeCatalogModel,
    rollupRows,
} from "../model-data.js";

const MODEL_ROUTE_HEALTH_URL = "https://gen.pollinations.ai/models/status";
const MODEL_CATALOG_URL = "https://gen.pollinations.ai/models?reliability=all";

// Minutes parameter for the parameterized model_route_health pipe
const WINDOW_MINUTES = {
    "7d": 10080,
    "24h": 1440,
    "4h": 240,
    "60m": 60,
    "5m": 5,
};

// Poll intervals based on aggregation window
const POLL_INTERVALS = {
    "7d": 300000, // 5 minutes for 7-day view
    "24h": 120000, // 2 minutes for 24-hour view
    "4h": 60000, // 1 minute for 4-hour view
    "60m": 60000, // 1 minute for stable 60m view
    "5m": 60000, // Match the model status gateway cache
};

export function useModelMonitor(aggregationWindow = "60m") {
    const pollInterval =
        POLL_INTERVALS[aggregationWindow] || POLL_INTERVALS["60m"];
    const [models, setModels] = useState([]);
    const [routeStats, setRouteStats] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [catalogError, setCatalogError] = useState(null);
    const [healthError, setHealthError] = useState(null);
    const [endpointStatus, setEndpointStatus] = useState({
        catalog: null,
    });
    const error = healthError || catalogError;

    // Fetch model list from gen.pollinations.ai
    const fetchModels = useCallback(async () => {
        try {
            const res = await fetch(MODEL_CATALOG_URL);
            if (!res.ok) {
                throw new Error(`Catalog error: ${res.status}`);
            }
            const catalog = await res.json();
            if (!Array.isArray(catalog)) {
                throw new Error("Catalog response was not an array");
            }
            const catalogModels = catalog
                .map(normalizeCatalogModel)
                .filter(Boolean)
                .sort((a, b) => a.name.localeCompare(b.name));

            setEndpointStatus({ catalog: true });
            setModels(catalogModels);
            setCatalogError(null);
        } catch (err) {
            console.error("Failed to fetch model catalog:", err);
            setEndpointStatus({ catalog: false });
            setModels([]);
            setCatalogError("Failed to fetch model catalog");
        }
    }, []);

    // One request covers the whole page: model_route_health returns a rollup
    // row per model alongside the routes that make it up, so the headline and
    // its breakdown can never disagree about the same window.
    const fetchRouteStats = useCallback(async () => {
        try {
            const minutes =
                WINDOW_MINUTES[aggregationWindow] || WINDOW_MINUTES["60m"];
            const url = `${MODEL_ROUTE_HEALTH_URL}?minutes=${minutes}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Model status API error: ${response.status}`);
            }

            const data = await response.json();
            setRouteStats(data.data || []);
            setLastUpdated(new Date());
            setHealthError(null);
        } catch (err) {
            console.error("Failed to fetch model health stats:", err);
            setHealthError("Failed to fetch health stats");
        }
    }, [aggregationWindow]);

    const allModels = useMemo(() => {
        // The rollup rows carry the same shape model_health used to, so the
        // identity and catalog-anomaly rules are unchanged; only the arithmetic
        // behind each headline moved into the pipe.
        const withHealth = mergeModelHealth(
            models,
            rollupRows(routeStats),
            endpointStatus.catalog,
        );
        return attachRouteHealth(withHealth, routeStats);
    }, [models, routeStats, endpointStatus.catalog]);

    const refresh = useCallback(() => {
        fetchModels();
        fetchRouteStats();
    }, [fetchModels, fetchRouteStats]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, pollInterval);
        return () => clearInterval(interval);
    }, [refresh, pollInterval]);

    return {
        models: allModels,
        refresh,
        pollInterval,
        lastUpdated,
        error,
        endpointStatus,
        aggregationWindow, // Current window for UI display
    };
}
