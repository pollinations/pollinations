import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
const SPARKLINE_POINTS = 20; // Keep the last 20 poll snapshots for sparklines
const TREND_SAMPLES = 8; // Compare against the oldest retained snapshot
const MIN_TREND_SAMPLES = 4; // Need at least 4 snapshots before showing trends

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

// Helper to extract metrics from stats
function extractMetrics(stats) {
    if (!stats) return null;
    const total = stats.total_requests || 0;
    const err5xx = stats.errors_5xx || 0;
    return {
        p95: stats.latency_p95_ms || 0,
        err5xxPct: total > 0 ? (err5xx / total) * 100 : 0,
        volume: total,
    };
}

// Compute trend by comparing current metrics to the oldest retained snapshot
function computeTrend(currentMetrics, samples) {
    if (!currentMetrics || samples.length < MIN_TREND_SAMPLES) return null;

    const oldest = samples[0]; // Oldest sample (up to 2 min ago)

    const p95Change =
        oldest.p95 > 0
            ? ((currentMetrics.p95 - oldest.p95) / oldest.p95) * 100
            : 0;

    const err5xxChange = currentMetrics.err5xxPct - oldest.err5xxPct;

    const volumeChange =
        oldest.volume > 0
            ? ((currentMetrics.volume - oldest.volume) / oldest.volume) * 100
            : 0;

    return { p95Change, err5xxChange, volumeChange };
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

    // History for trends and sparklines
    const historyRef = useRef({}); // { modelKey: { prev: stats, sparkline: [{p95, err5xx, volume}, ...] } }
    const lastFetchRef = useRef(null); // Track when we last processed data

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

    // Get history and compute trends for a model
    const getModelTrend = useCallback((modelKey, stats) => {
        if (!stats) return { trend: null, sparkline: [] };

        const history = historyRef.current[modelKey] || {
            samples: [],
            sparkline: [],
        };

        // Extract current metrics and compute trend against oldest sample
        const currentMetrics = extractMetrics(stats);
        const trend = computeTrend(currentMetrics, history.samples);

        return { trend, sparkline: history.sparkline };
    }, []);

    // Update history when new data arrives (moved to useEffect to avoid side effects in render)
    useEffect(() => {
        if (!lastUpdated || healthStats.length === 0) return;

        // Check if this is new data
        if (lastFetchRef.current === lastUpdated.getTime()) return;
        lastFetchRef.current = lastUpdated.getTime();

        const modelStatsForHistory = healthStats.filter(
            (s) => s.model !== "undefined",
        );

        modelStatsForHistory.forEach((stats) => {
            const modelKey = `${stats.event_type?.replace("generate.", "") || "unknown"}-${stats.model}`;
            const history = historyRef.current[modelKey] || {
                samples: [],
                sparkline: [],
            };

            // Extract metrics for this sample
            const metrics = extractMetrics(stats);

            // Add to samples (keep the most recent poll snapshots)
            const samples = [...history.samples, metrics].slice(-TREND_SAMPLES);

            // Update sparkline with new point
            const sparkline = [...history.sparkline, metrics].slice(
                -SPARKLINE_POINTS,
            );

            // Save updated history
            historyRef.current[modelKey] = { samples, sparkline };
        });
    }, [healthStats, lastUpdated]);

    const catalogModelsByName = useMemo(
        () =>
            models.reduce((acc, model) => {
                if (!acc[model.name]) acc[model.name] = [];
                acc[model.name].push(model);
                return acc;
            }, {}),
        [models],
    );

    // Merge models with health stats, trends, and sparklines.
    // Use endpointType (original API endpoint) for Tinybird matching since
    // Tinybird reports e.g. generate.image for video models served from /image/models.
    const mergedModels = models.map((model) => {
        const statsType = model.endpointType || model.type;
        const modelKey = `${statsType}-${model.name}`;
        const stats =
            modelStats.find(
                (s) =>
                    s.model === model.name &&
                    s.event_type === `generate.${statsType}`,
            ) ?? null;
        const { trend, sparkline } = getModelTrend(modelKey, stats);
        return {
            ...model,
            provider: model.provider || stats?.provider,
            stats,
            trend,
            sparkline,
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
        const modelKey = `${statsType}-${s.model}`;
        const stats = s;
        const { trend, sparkline } = getModelTrend(modelKey, stats);
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
            trend,
            sparkline,
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
        tinybirdConfigured,
        endpointStatus,
        aggregationWindow, // Current window for UI display
    };
}
