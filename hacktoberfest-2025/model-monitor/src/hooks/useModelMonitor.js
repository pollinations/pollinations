import { useState, useEffect, useCallback, useRef } from "react";

// Tinybird config
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICIwODVjOWEwOS04MGI4LTQzZWUtYjUxMS1lZjhiNTA3YjQ5NjIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.jilYql9mjeuHPR-WMfzQXXjxNPyMjtG9VFOsmDCz_X4";

// Model list endpoints
const MODEL_ENDPOINTS = {
    image: "https://enter.pollinations.ai/api/generate/image/models",
    text: "https://enter.pollinations.ai/api/generate/text/models",
};

const POLL_INTERVAL = 15000; // 15 seconds (reduced from 30s for faster trend detection)
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

export function useModelMonitor() {
    const [models, setModels] = useState([]);
    const [healthStats, setHealthStats] = useState([]);
    const [isPolling, setIsPolling] = useState(true);
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
            const url = `${TINYBIRD_HOST}/v0/pipes/model_health.json?token=${TINYBIRD_TOKEN}`;
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
    }, []);

    // Separate gateway stats (undefined model = auth/validation failures before model resolution)
    const gatewayStats = healthStats.filter((s) => s.model === "undefined");
    const modelStats = healthStats.filter((s) => s.model !== "undefined");

    // Check if this is new data (different fetch time)
    const isNewData =
        lastUpdated && lastFetchRef.current !== lastUpdated?.getTime();
    if (isNewData) {
        lastFetchRef.current = lastUpdated.getTime();
    }

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

    // Update history only when new data arrives
    if (isNewData && healthStats.length > 0) {
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
    }

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

    const togglePolling = useCallback(() => {
        setIsPolling((prev) => !prev);
    }, []);

    // Initial fetch
    useEffect(() => {
        refresh();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [refresh]);

    // Polling
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }

        if (isPolling) {
            intervalRef.current = setInterval(refresh, POLL_INTERVAL);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isPolling, refresh]);

    return {
        models: allModels,
        gatewayStats, // Pre-model auth/validation failures
        isPolling,
        togglePolling,
        refresh,
        pollInterval: POLL_INTERVAL,
        lastUpdated,
        error,
        tinybirdConfigured,
        endpointStatus,
    };
}
