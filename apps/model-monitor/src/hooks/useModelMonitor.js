import { useCallback, useEffect, useRef, useState } from "react";

// Tinybird config
// Note: This is a READ-ONLY public token, safe to expose in client code
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

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
    "5m": 15000, // 15 seconds for live 5m view
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
    };
}

export function useModelMonitor(aggregationWindow = "60m") {
    const pollInterval =
        POLL_INTERVALS[aggregationWindow] || POLL_INTERVALS["60m"];
    const [models, setModels] = useState([]);
    const [healthStats, setHealthStats] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [endpointStatus, setEndpointStatus] = useState({
        catalog: null,
    });
    const tinybirdConfigured = !!TINYBIRD_PUBLIC_READ_TOKEN;
    const intervalRef = useRef(null);

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
            setError(null);
        } catch (err) {
            console.error("Failed to fetch model catalog:", err);
            setEndpointStatus({ catalog: false });
            setModels([]);
            setError("Failed to fetch model catalog");
        }
    }, []);

    // Fetch health stats from Tinybird
    const fetchHealthStats = useCallback(async () => {
        if (!TINYBIRD_PUBLIC_READ_TOKEN) {
            // Use mock data when Tinybird not configured
            setHealthStats([]);
            return;
        }

        try {
            const minutes =
                WINDOW_MINUTES[aggregationWindow] || WINDOW_MINUTES["60m"];
            const url = `${TINYBIRD_HOST}/v0/pipes/model_health.json?token=${TINYBIRD_PUBLIC_READ_TOKEN}&minutes=${minutes}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Tinybird error: ${response.status}`);
            }

            const data = await response.json();
            setHealthStats(data.data || []);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error("Failed to fetch health stats:", err);
            setError("Failed to fetch health stats from Tinybird");
        }
    }, [aggregationWindow]);

    const modelStats = healthStats.filter((s) => s.model !== "undefined");

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
        models: mergedModels,
        refresh,
        pollInterval,
        lastUpdated,
        error,
        tinybirdConfigured,
        endpointStatus,
        aggregationWindow, // Current window for UI display
    };
}
