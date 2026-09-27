import { useCallback, useEffect, useState } from "react";

const RESULTS_BASE =
    "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/model-evals/results";

export function useModelEvals() {
    const [history, setHistory] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [run, setRun] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch(`${RESULTS_BASE}/index.json`);
            if (!res.ok) throw new Error(`Index error: ${res.status}`);
            const index = await res.json();
            setHistory(index.sort((a, b) => b.runId.localeCompare(a.runId)));
            setError(null);
        } catch (err) {
            console.error("Failed to fetch eval history:", err);
            setError("No eval runs published yet");
        }
    }, []);

    const fetchRun = useCallback(async (runId) => {
        setLoading(true);
        try {
            const file = runId ? `${runId}.json` : "latest.json";
            const res = await fetch(`${RESULTS_BASE}/${file}`);
            if (!res.ok) throw new Error(`Run fetch error: ${res.status}`);
            const data = await res.json();
            setRun(data);
            setSelectedRunId(data.runId);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch eval run:", err);
            setError("No eval runs published yet");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
        fetchRun(null);
    }, [fetchHistory, fetchRun]);

    return {
        history,
        run,
        selectedRunId,
        loading,
        error,
        selectRun: fetchRun,
    };
}
