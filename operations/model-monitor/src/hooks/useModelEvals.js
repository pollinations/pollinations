import { useCallback, useEffect, useState } from "react";

const RESULTS_BASE =
    "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/model-evals/results";

async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export function useModelEvals() {
    const [history, setHistory] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [run, setRun] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const selectRun = useCallback(async (runId) => {
        setLoading(true);
        try {
            const filename = runId ? `${runId}.json` : "latest.json";
            const next = await fetchJson(`${RESULTS_BASE}/${filename}`);
            setRun(next);
            setSelectedRunId(next.runId);
            setError(null);
        } catch {
            setError("No model-eval results have been published yet.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        async function load() {
            try {
                const index = await fetchJson(`${RESULTS_BASE}/index.json`);
                if (!active) return;
                const runs = Array.isArray(index.runs) ? index.runs : [];
                setHistory(runs);
            } catch {
                if (active) setHistory([]);
            }
            if (active) await selectRun(null);
        }
        void load();
        return () => {
            active = false;
        };
    }, [selectRun]);

    return { run, history, selectedRunId, loading, error, selectRun };
}
