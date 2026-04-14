import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_SERVICES } from "../../../../shared/registry/audio.ts";
import { IMAGE_SERVICES } from "../../../../shared/registry/image.ts";
import { TEXT_SERVICES } from "../../../../shared/registry/text.ts";

// Tinybird config
// Note: This is a READ-ONLY public token, safe to expose in client code
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

// Tinybird pipes for different aggregation windows
const TINYBIRD_PIPES = {
    "7d": "model_health_7d",
    "24h": "model_health_24h",
    "60m": "model_health_60m",
    "5m": "model_health",
};

// Poll intervals based on aggregation window
const POLL_INTERVALS = {
    "7d": 300000, // 5 minutes for 7-day view
    "24h": 120000, // 2 minutes for 24-hour view
    "60m": 60000, // 1 minute for stable 60m view
    "5m": 15000, // 15 seconds for live 5m view
};
const SPARKLINE_POINTS = 20; // Keep the last 20 poll snapshots for sparklines
const TREND_SAMPLES = 8; // Compare against the oldest retained snapshot
const MIN_TREND_SAMPLES = 4; // Need at least 4 snapshots before showing trends

function resolveDisplayType(model, endpointType) {
    const out = model.output_modalities;
    if (endpointType === "image" && out?.includes("video")) return "video";
    return endpointType;
}

function registryServicesToModels(services, endpointType) {
    return Object.entries(services).map(([name, service]) => ({
        name,
        description: service.description,
        hidden: Boolean(service.hidden),
        type: resolveDisplayType(
            { output_modalities: service.outputModalities },
            endpointType,
        ),
        endpointType,
        catalogStatus: service.hidden ? "hidden" : "visible",
    }));
}

const ALL_REGISTERED_MODELS = [
    ...registryServicesToModels(TEXT_SERVICES, "text"),
    ...registryServicesToModels(IMAGE_SERVICES, "image"),
    ...registryServicesToModels(AUDIO_SERVICES, "audio"),
]
    .filter((m) => !m.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));

// Calculate total 4xx errors (user errors)
function calcTotal4xx(stats) {
    return (
        (stats.errors_400 || 0) +
        (stats.errors_401 || 0) +
        (stats.errors_402 || 0) +
        (stats.errors_403 || 0) +
        (stats.errors_429 || 0) +
        (stats.errors_4xx_other || 0)
    );
}

// Calculate total 5xx errors (model/server errors)
function calcTotal5xx(stats) {
    return (
        (stats.errors_500 || 0) +
        (stats.errors_502 || 0) +
        (stats.errors_503 || 0) +
        (stats.errors_504 || 0) +
        (stats.errors_5xx_other || 0)
    );
}

// Enrich stats with computed totals
function enrichStats(stats) {
    if (!stats) return null;
    return {
        ...stats,
        total_4xx: calcTotal4xx(stats),
        total_5xx: calcTotal5xx(stats),
    };
}

// Helper to extract metrics from stats
function extractMetrics(stats) {
    if (!stats) return null;
    const total = stats.total_requests || 0;
    const err5xx = calcTotal5xx(stats);
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
    const [healthStats, setHealthStats] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const tinybirdConfigured = !!TINYBIRD_PUBLIC_READ_TOKEN;
    const intervalRef = useRef(null);

    // Static model list comes straight from the bundled registry — there is
    // no value in re-fetching /image/models, /text/models, /audio/models since
    // we only display name/type/description, all of which the registry has.
    const models = ALL_REGISTERED_MODELS;

    // History for trends and sparklines
    const historyRef = useRef({}); // { modelKey: { prev: stats, sparkline: [{p95, err5xx, volume}, ...] } }
    const lastFetchRef = useRef(null); // Track when we last processed data

    // Fetch health stats from Tinybird
    const fetchHealthStats = useCallback(async () => {
        if (!TINYBIRD_PUBLIC_READ_TOKEN) {
            // Use mock data when Tinybird not configured
            setHealthStats([]);
            return;
        }

        try {
            const pipeName =
                TINYBIRD_PIPES[aggregationWindow] || TINYBIRD_PIPES["60m"];
            const url = `${TINYBIRD_HOST}/v0/pipes/${pipeName}.json?token=${TINYBIRD_PUBLIC_READ_TOKEN}`;
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

    // Separate gateway stats (undefined model = auth/validation failures before model resolution)
    const gatewayStats = healthStats.filter((s) => s.model === "undefined");
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

    // Merge models with health stats by canonical model name.
    // The gateway resolves aliases and validates model family before tracking,
    // so each Tinybird row maps to exactly one registered model by name.
    const statsByModel = new Map(modelStats.map((s) => [s.model, s]));

    const mergedModels = models.map((model) => {
        const modelKey = `${model.endpointType || model.type}-${model.name}`;
        const stats = enrichStats(statsByModel.get(model.name));
        const { trend, sparkline } = getModelTrend(modelKey, stats);
        return { ...model, stats, trend, sparkline };
    });

    // Surface any Tinybird rows that don't match a registered model.
    const knownNames = new Set(models.map((m) => m.name));
    const extraModels = modelStats
        .filter((s) => !knownNames.has(s.model))
        .map((s) => {
            const statsType =
                s.event_type?.replace("generate.", "") || "unknown";
            const modelKey = `${statsType}-${s.model}`;
            const stats = enrichStats(s);
            const { trend, sparkline } = getModelTrend(modelKey, stats);
            return {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                description: "Unregistered model",
                catalogStatus: "unregistered",
                stats,
                trend,
                sparkline,
            };
        });

    const allModels = [...mergedModels, ...extraModels];

    const refresh = useCallback(() => {
        fetchHealthStats();
    }, [fetchHealthStats]);

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
        gatewayStats, // Pre-model auth/validation failures
        refresh,
        pollInterval,
        lastUpdated,
        error,
        tinybirdConfigured,
        aggregationWindow, // Current window for UI display
    };
}
