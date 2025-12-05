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

const POLL_INTERVAL = 30000; // 30 seconds

export function useModelMonitor() {
    const [models, setModels] = useState([]);
    const [healthStats, setHealthStats] = useState([]);
    const [isPolling, setIsPolling] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const tinybirdConfigured = !!TINYBIRD_TOKEN;
    const intervalRef = useRef(null);

    // Fetch model list from enter.pollinations.ai
    const fetchModels = useCallback(async () => {
        try {
            const [imageRes, textRes] = await Promise.all([
                fetch(MODEL_ENDPOINTS.image),
                fetch(MODEL_ENDPOINTS.text),
            ]);

            const imageModels = await imageRes.json();
            const textModels = await textRes.json();

            const allModels = [
                ...imageModels.map((m) => ({ ...m, type: "image" })),
                ...textModels.map((m) => ({ ...m, type: "text" })),
            ].sort((a, b) => a.name.localeCompare(b.name));

            setModels(allModels);
        } catch (err) {
            console.error("Failed to fetch models:", err);
            setError("Failed to fetch model list");
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

    // Merge models with health stats
    const mergedModels = models.map((model) => {
        const stats = modelStats.find(
            (s) =>
                s.model === model.name &&
                s.event_type === `generate.${model.type}`,
        );
        return { ...model, stats: stats || null };
    });

    // Add models from health stats that aren't in the registered model list (but not "undefined")
    const unmatchedStats = modelStats.filter(
        (s) =>
            !models.some(
                (m) =>
                    m.name === s.model && `generate.${m.type}` === s.event_type,
            ),
    );
    const extraModels = unmatchedStats.map((s) => ({
        name: s.model || "(unknown)",
        type: s.event_type?.replace("generate.", "") || "unknown",
        description: "Unregistered model",
        stats: s,
    }));

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
    };
}
