import { useCallback, useEffect, useMemo, useState } from "react";
import { mergeModelHealth, normalizeCatalogModel } from "../model-data.js";

const MODEL_HEALTH_URL = "https://gen.pollinations.ai/v1/models/status";
const MODEL_CATALOG_URL = "https://gen.pollinations.ai/models";

// Minutes parameter for the parameterized model_health pipe
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
    const [healthStats, setHealthStats] = useState([]);
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

    // Fetch health stats through gen.pollinations.ai, which caches Tinybird.
    const fetchHealthStats = useCallback(async () => {
        try {
            const minutes =
                WINDOW_MINUTES[aggregationWindow] || WINDOW_MINUTES["60m"];
            const url = `${MODEL_HEALTH_URL}?minutes=${minutes}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Model status API error: ${response.status}`);
            }

            const sourceTimestamp = response.headers.get(
                "X-Model-Status-Timestamp",
            );
            if (!sourceTimestamp) {
                throw new Error("Model status API omitted its data timestamp");
            }

            const data = await response.json();
            setHealthStats(data.data || []);
            setLastUpdated(new Date(sourceTimestamp));
            setHealthError(
                response.headers.get("X-Model-Status-Stale") === "true"
                    ? "Live health data unavailable; showing cached data"
                    : null,
            );
        } catch (err) {
            console.error("Failed to fetch health stats:", err);
            setHealthError("Failed to fetch health stats");
        }
    }, [aggregationWindow]);

    const allModels = useMemo(
        () => mergeModelHealth(models, healthStats, endpointStatus.catalog),
        [models, healthStats, endpointStatus.catalog],
    );

    const refresh = useCallback(() => {
        fetchModels();
        fetchHealthStats();
    }, [fetchModels, fetchHealthStats]);

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
