import { useCallback, useEffect, useRef, useState } from "react";

// Tinybird config
// Note: This is a READ-ONLY public token, safe to expose in client code
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJmZTRjODM1Ni1iOTYwLTQ0ZTYtODE1Mi1kY2UwYjc0YzExNjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.Wc49vYoVYI_xd4JSsH_Fe8mJk7Oc9hx0IIldwc1a44g";

// Model list endpoints
const MODEL_ENDPOINTS = {
    image: "https://enter.pollinations.ai/api/generate/image/models",
    text: "https://enter.pollinations.ai/api/generate/text/models",
};

// Tinybird pipes for different aggregation windows
const TINYBIRD_PIPES = {
    "60m": "model_health_60m",
    "5m": "model_health",
};

// Poll intervals based on aggregation window
const POLL_INTERVALS = {
    "60m": 60000, // 1 minute for stable 60m view
    "5m": 15000, // 15 seconds for live 5m view
};
const SPARKLINE_POINTS = 20; // Keep 20 data points for sparklines (~5 min at 15s intervals)
const TREND_SAMPLES = 8; // Compare current to 8 samples ago (~2 min baseline)
const MIN_TREND_SAMPLES = 4; // Need at least 1 min of data before showing trends

// Helper to extract metrics from stats
function extractMetrics(stats) {
    if (!stats) return null;
    const total = stats.total_requests || 0;
    const err5xx =
        (stats.errors_500 || 0) +
        (stats.errors_502 || 0) +
        (stats.errors_503 || 0) +
        (stats.errors_504 || 0);
    return {
        p95: stats.latency_p95_ms || 0,
        err5xxPct: total > 0 ? (err5xx / total) * 100 : 0,
        volume: total,
    };
}

// Compute trend by comparing current to oldest sample (2 min baseline)
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
        image: null,
        text: null,
    });
    const tinybirdConfigured = !!TINYBIRD_TOKEN;
    const intervalRef = useRef(null);

    // History for trends and sparklines
    const historyRef = useRef({}); // { modelKey: { prev: stats, sparkline: [{p95, err5xx, volume}, ...] } }
    const lastFetchRef = useRef(null); // Track when we last processed data

    // Fetch model list from enter.pollinations.ai
    const fetchModels = useCallback(async () => {
        let imageOk = false;
        let textOk = false;
        let imageModels = [];
        let textModels = [];

        try {
            const imageRes = await fetch(MODEL_ENDPOINTS.image);
            imageOk = imageRes.ok;
            if (imageOk) imageModels = await imageRes.json();
        } catch (err) {
            console.error("Failed to fetch image models:", err);
        }

        try {
            const textRes = await fetch(MODEL_ENDPOINTS.text);
            textOk = textRes.ok;
            if (textOk) textModels = await textRes.json();
        } catch (err) {
            console.error("Failed to fetch text models:", err);
        }

        setEndpointStatus({ image: imageOk, text: textOk });

        const allModels = [
            ...imageModels.map((m) => ({ ...m, type: "image" })),
            ...textModels.map((m) => ({ ...m, type: "text" })),
        ].sort((a, b) => a.name.localeCompare(b.name));

        setModels(allModels);

        if (!imageOk && !textOk) {
            setError("Failed to fetch model list");
        } else {
            setError(null);
        }
    }, []);

    // Fetch health stats from Tinybird
    const fetchHealthStats = useCallback(async () => {
        if (!TINYBIRD_TOKEN) {
            // Use mock data when Tinybird not configured
            setHealthStats([]);
            return;
        }

        try {
            const pipeName =
                TINYBIRD_PIPES[aggregationWindow] || TINYBIRD_PIPES["60m"];
            const url = `${TINYBIRD_HOST}/v0/pipes/${pipeName}.json?token=${TINYBIRD_TOKEN}`;
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

            // Add to samples (keep last TREND_SAMPLES for 2-min baseline)
            const samples = [...history.samples, metrics].slice(-TREND_SAMPLES);

            // Update sparkline with new point
            const sparkline = [...history.sparkline, metrics].slice(
                -SPARKLINE_POINTS,
            );

            // Save updated history
            historyRef.current[modelKey] = { samples, sparkline };
        });
    }, [healthStats, lastUpdated]);

    // Merge models with health stats, trends, and sparklines
    const mergedModels = models.map((model) => {
        const modelKey = `${model.type}-${model.name}`;
        const stats = modelStats.find(
            (s) =>
                s.model === model.name &&
                s.event_type === `generate.${model.type}`,
        );
        const { trend, sparkline } = getModelTrend(modelKey, stats);
        return { ...model, stats: stats || null, trend, sparkline };
    });

    // Add models from health stats that aren't in the registered model list (but not "undefined")
    const unmatchedStats = modelStats.filter(
        (s) =>
            !models.some(
                (m) =>
                    m.name === s.model && `generate.${m.type}` === s.event_type,
            ),
    );
    const extraModels = unmatchedStats.map((s) => {
        const modelKey = `${s.event_type?.replace("generate.", "") || "unknown"}-${s.model}`;
        const { trend, sparkline } = getModelTrend(modelKey, s);
        return {
            name: s.model || "(unknown)",
            type: s.event_type?.replace("generate.", "") || "unknown",
            description: "Unregistered model",
            stats: s,
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
        gatewayStats, // Pre-model auth/validation failures
        refresh,
        pollInterval,
        lastUpdated,
        error,
        tinybirdConfigured,
        endpointStatus,
        aggregationWindow, // Current window for UI display
    };
}
