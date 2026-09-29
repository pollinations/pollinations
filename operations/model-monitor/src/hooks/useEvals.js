import { useCallback, useEffect, useState } from "react";
import {
    EVALS_HISTORY_URL,
    EVALS_LATEST_URL,
    normalizeEvalHistory,
    normalizeEvalRun,
} from "../evals-data.js";

// The eval leaderboard is a weekly static snapshot published by the evals
// workflow, not live traffic: fetch both files once and expose a refresh
// for the tab's manual retry.
export function useEvals() {
    const [run, setRun] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [latestRes, historyRes] = await Promise.all([
                fetch(EVALS_LATEST_URL),
                fetch(EVALS_HISTORY_URL),
            ]);
            if (!latestRes.ok && latestRes.status !== 404) {
                throw new Error(`Eval results error: ${latestRes.status}`);
            }
            const latest = latestRes.ok ? await latestRes.json() : null;
            const normalizedRun = normalizeEvalRun(latest);
            if (!normalizedRun) {
                throw new Error("No eval results published yet");
            }
            let normalizedHistory = [];
            if (historyRes.ok) {
                normalizedHistory = normalizeEvalHistory(
                    await historyRes.json(),
                );
            }
            setRun(normalizedRun);
            setHistory(normalizedHistory);
        } catch (err) {
            console.error("Failed to load eval results:", err);
            setError(err.message ?? "Failed to load eval results");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { run, history, loading, error, refresh: load };
}
