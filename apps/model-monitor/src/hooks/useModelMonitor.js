import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_SERVICES } from "../../../../shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "../../../../shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "../../../../shared/registry/image.ts";
import { TEXT_SERVICES } from "../../../../shared/registry/text.ts";

// Tinybird config
// Note: This is a READ-ONLY public token, safe to expose in client code
const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

// Model list endpoints
const MODEL_ENDPOINTS = {
    image: "https://gen.pollinations.ai/image/models",
    text: "https://gen.pollinations.ai/text/models",
    audio: "https://gen.pollinations.ai/audio/models",
    embedding: "https://gen.pollinations.ai/embeddings/models",
};

// Minutes parameter for the parameterized model_health pipe
const WINDOW_MINUTES = {
    "7d": 10080,
    "24h": 1440,
    "60m": 60,
    "5m": 5,
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
        aliases: service.aliases,
        description: service.description,
        input_modalities: service.inputModalities,
        output_modalities: service.outputModalities,
        paid_only: service.paidOnly,
        hidden: Boolean(service.hidden),
        provider: service.provider,
        brand: service.brand,
        type: resolveDisplayType(
            { output_modalities: service.outputModalities },
            endpointType,
        ),
        endpointType,
    }));
}

const ALL_REGISTERED_MODELS = [
    ...registryServicesToModels(TEXT_SERVICES, "text"),
    ...registryServicesToModels(IMAGE_SERVICES, "image"),
    ...registryServicesToModels(AUDIO_SERVICES, "audio"),
    ...registryServicesToModels(EMBEDDING_SERVICES, "embedding"),
];

const VISIBLE_REGISTERED_MODELS = ALL_REGISTERED_MODELS.filter(
    (m) => !m.hidden,
);

const VISIBLE_REGISTERED_MODELS_BY_ENDPOINT = VISIBLE_REGISTERED_MODELS.reduce(
    (acc, model) => {
        if (!acc[model.endpointType]) acc[model.endpointType] = [];
        acc[model.endpointType].push(model);
        return acc;
    },
    {},
);

const REGISTERED_MODELS_BY_SIGNATURE = new Map(
    ALL_REGISTERED_MODELS.map((m) => [`${m.endpointType}:${m.name}`, m]),
);

const REGISTERED_MODELS_BY_NAME = ALL_REGISTERED_MODELS.reduce((acc, model) => {
    if (!acc[model.name]) acc[model.name] = [];
    acc[model.name].push(model);
    return acc;
}, {});

function normalizeModelEntry(model, endpointType, source = "endpoint") {
    const registryMatch = REGISTERED_MODELS_BY_SIGNATURE.get(
        `${endpointType}:${model.name}`,
    );
    const merged = {
        ...registryMatch,
        ...model,
        endpointType,
    };

    return {
        ...merged,
        type: resolveDisplayType(merged, endpointType),
        hidden: registryMatch?.hidden ?? Boolean(model.hidden),
        catalogStatus: source,
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
        image: null,
        text: null,
        audio: null,
        embedding: null,
    });
    const tinybirdConfigured = !!TINYBIRD_PUBLIC_READ_TOKEN;
    const intervalRef = useRef(null);

    // History for trends and sparklines
    const historyRef = useRef({}); // { modelKey: { prev: stats, sparkline: [{p95, err5xx, volume}, ...] } }
    const lastFetchRef = useRef(null); // Track when we last processed data

    // Fetch model list from gen.pollinations.ai
    const fetchModels = useCallback(async () => {
        const entries = await Promise.all(
            Object.entries(MODEL_ENDPOINTS).map(async ([type, url]) => {
                try {
                    const res = await fetch(url);
                    return [
                        type,
                        {
                            ok: res.ok,
                            models: res.ok ? await res.json() : [],
                        },
                    ];
                } catch (err) {
                    console.error(`Failed to fetch ${type} models:`, err);
                    return [type, { ok: false, models: [] }];
                }
            }),
        );

        const results = Object.fromEntries(entries);

        setEndpointStatus({
            image: results.image?.ok ?? null,
            text: results.text?.ok ?? null,
            audio: results.audio?.ok ?? null,
            embedding: results.embedding?.ok ?? null,
        });

        const allModels = Object.entries(results)
            .flatMap(([type, { ok, models }]) =>
                (ok
                    ? models
                    : VISIBLE_REGISTERED_MODELS_BY_ENDPOINT[type] || []
                ).map((m) =>
                    normalizeModelEntry(
                        m,
                        type,
                        ok ? "visible" : "endpoint-fallback",
                    ),
                ),
            )
            .sort((a, b) => a.name.localeCompare(b.name));

        setModels(allModels);

        if (Object.values(results).every((r) => !r.ok)) {
            setError("Failed to fetch model list");
        } else {
            setError(null);
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
        return { ...model, stats, trend, sparkline };
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
        const registeredExact = REGISTERED_MODELS_BY_SIGNATURE.get(
            `${statsType}:${s.model}`,
        );
        const sameNameMatches = REGISTERED_MODELS_BY_NAME[s.model] || [];

        let modelMeta;
        if (registeredExact) {
            modelMeta = {
                ...registeredExact,
                catalogStatus: registeredExact.hidden
                    ? "hidden"
                    : "registry-only",
            };
        } else if (sameNameMatches.length > 0) {
            const registeredTypes = [
                ...new Set(sameNameMatches.map((m) => m.type)),
            ].sort();
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                description: `Unexpected ${statsType} traffic; registered as ${registeredTypes.join("/")}`,
                catalogStatus: "anomaly",
            };
        } else if (endpointStatus[statsType] === false) {
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
                description: `Unknown ${statsType} model while catalog endpoint is unavailable`,
                catalogStatus: "catalog-unavailable",
            };
        } else {
            modelMeta = {
                name: s.model || "(unknown)",
                type: statsType,
                endpointType: statsType,
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
