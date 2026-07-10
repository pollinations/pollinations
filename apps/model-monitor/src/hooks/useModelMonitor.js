import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function resolveDisplayType(model) {
    if (model.category) return model.category;
    const out = model.output_modalities;
    if (out?.includes("video")) return "video";
    if (out?.includes("embedding")) return "embedding";
    if (out?.includes("audio")) return "audio";
    if (out?.includes("image")) return "image";
    if (out?.includes("text")) return "text";
    return "unknown";
}

function eventTypeForDisplayType(type) {
    return type === "video" ? "image" : type;
}

function normalizeCatalogModel(model) {
    const name = model.name || model.id;
    if (!name) return null;
    const type = resolveDisplayType(model);
    return {
        ...model,
        name,
        aliases: model.aliases || [],
        type,
        endpointType: eventTypeForDisplayType(type),
        catalogStatus: "visible",
    };
}

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
    const intervalRef = useRef(null);
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

    const modelStats = healthStats.filter((s) => s.model !== "undefined");

    const catalogModelsByName = useMemo(
        () =>
            models.reduce((acc, model) => {
                if (!acc[model.name]) acc[model.name] = [];
                acc[model.name].push(model);
                return acc;
            }, {}),
        [models],
    );

    // Merge models with health stats.
    // Use endpointType (original API endpoint) for Tinybird matching since
    // Tinybird reports e.g. generate.image for video models served from /image/models.
    const mergedModels = models.map((model) => {
        const statsType = model.endpointType || model.type;
        const stats =
            modelStats.find(
                (s) =>
                    s.model === model.name &&
                    s.event_type === `generate.${statsType}`,
            ) ?? null;
        return {
            ...model,
            provider: model.provider || stats?.provider,
            stats,
        };
    });

    // Add models from health stats that aren't in the visible model list (but not "undefined")
    const unmatchedStats = modelStats.filter(
        (s) =>
            !models.some(
                (m) =>
                    m.name === s.model &&
                    `generate.${m.endpointType || m.type}` === s.event_type,
            ),
    );
    const extraModels = unmatchedStats.map((s) => {
        const statsType = s.event_type?.replace("generate.", "") || "unknown";
        const stats = s;
        const sameNameMatches = catalogModelsByName[s.model] || [];

        let modelMeta;
        if (endpointStatus.catalog === false) {
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                provider: s.provider,
                description: "Unknown model while live catalog is unavailable",
                catalogStatus: "catalog-unavailable",
            };
        } else if (sameNameMatches.length > 0) {
            const registeredTypes = [
                ...new Set(sameNameMatches.map((m) => m.type)),
            ].sort();
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                provider: s.provider,
                description: `Unexpected ${statsType} traffic; registered as ${registeredTypes.join("/")}`,
                catalogStatus: "anomaly",
            };
        } else {
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                provider: s.provider,
                description: "Unregistered model",
                catalogStatus: "unregistered",
            };
        }

        return {
            ...modelMeta,
            stats,
        };
    });

    const allModels = [...mergedModels, ...extraModels];

    const refresh = useCallback(() => {
        fetchModels();
        fetchHealthStats();
    }, [fetchModels, fetchHealthStats]);

    // Initial fetch
    useEffect(() => {
        refresh();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [refresh]);

    // Polling - always active
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        intervalRef.current = setInterval(refresh, pollInterval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
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
