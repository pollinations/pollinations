import { useEffect, useState } from "react";

// The Evals tab: the latest Alice in Wonderland ranking, read from the files the
// weekly workflow writes (public/evals/latest.json). Community models that share
// a base name with an official model are shown with the official one, and a gap
// bigger than the combined margin of error is highlighted.

const fmt = (x) => `${Math.round(x * 100)}%`;

function useEvals() {
    const [state, setState] = useState({
        loading: true,
        latest: null,
        history: [],
        error: null,
    });
    useEffect(() => {
        const base = import.meta.env.BASE_URL || "/";
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${base}evals/latest.json`, {
                    cache: "no-store",
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const latest = await res.json();
                let history = [];
                try {
                    const h = await fetch(`${base}evals/history.json`, {
                        cache: "no-store",
                    });
                    if (h.ok) history = await h.json();
                } catch {
                    /* history is optional */
                }
                if (!cancelled)
                    setState({ loading: false, latest, history, error: null });
            } catch (error) {
                if (!cancelled)
                    setState({
                        loading: false,
                        latest: null,
                        history: [],
                        error: String(error.message || error),
                    });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return state;
}

function GapRow({ gap }) {
    const cls = gap.highlighted
        ? "rounded bg-red-500/10 px-2 py-1 font-medium text-red-600 dark:text-red-400"
        : "px-2 py-1";
    return (
        <li className={cls}>
            {gap.community} — {fmt(gap.communityAccuracy)} vs {gap.official} —{" "}
            {fmt(gap.officialAccuracy)}
            {gap.highlighted
                ? ` (gap ${fmt(Math.abs(gap.gap))} exceeds the margin)`
                : ` (within the margin)`}
        </li>
    );
}

export default function EvalsPanel() {
    const { loading, latest, history, error } = useEvals();

    if (loading) return <p className="m-0 opacity-70">Loading evals…</p>;
    if (error)
        return (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                No eval run published yet ({error}). The weekly workflow writes{" "}
                <code>evals/latest.json</code> once a maintainer adds the key.
            </div>
        );

    const {
        ranking = [],
        impostorGaps = [],
        generatedAt,
        seed,
        questionsPerModel,
        costPollen,
    } = latest;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-lg font-semibold">
                    Alice in Wonderland evals
                </h2>
                <span className="text-xs opacity-70">
                    {generatedAt
                        ? new Date(generatedAt)
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")
                        : "-"}{" "}
                    UTC
                    {seed != null ? ` · seed ${seed}` : ""}
                    {questionsPerModel != null
                        ? ` · ${questionsPerModel} questions/model`
                        : ""}
                    {costPollen != null ? ` · ${costPollen.toFixed(4)} 🌼` : ""}
                </span>
            </div>
            <p className="m-0 max-w-3xl text-sm opacity-70">
                Every text model, community models included, on the same puzzle.
                Fresh random numbers each run, graded by code; a model that
                errors or times out counts as failed. A full run costs well
                under 20 Pollen.
            </p>

            <div className="max-w-full overflow-x-auto rounded border border-black/10 dark:border-white/10">
                <table className="min-w-[42rem] w-full text-sm">
                    <thead>
                        <tr className="text-left opacity-70">
                            <th className="px-3 py-2 font-medium">#</th>
                            <th className="px-3 py-2 font-medium">Model</th>
                            <th className="px-3 py-2 text-right font-medium">
                                Accuracy
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                ± error
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Correct
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Failed
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranking.map((s, i) => (
                            <tr
                                key={s.model}
                                className="border-t border-black/5 dark:border-white/5"
                            >
                                <td className="px-3 py-1.5 tabular-nums opacity-60">
                                    {i + 1}
                                </td>
                                <td className="px-3 py-1.5">
                                    {s.model}
                                    {s.community && (
                                        <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-[10px] uppercase dark:bg-white/10">
                                            community
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                    {fmt(s.accuracy)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                                    ±{fmt(s.margin)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                    {s.correct}/{s.total}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                                    {s.failed}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {impostorGaps.length > 0 && (
                <div>
                    <h3 className="m-0 text-sm font-semibold">
                        Community vs official (same base name)
                    </h3>
                    <ul className="m-0 list-none p-0 text-sm">
                        {impostorGaps.map((gap) => (
                            <GapRow
                                key={`${gap.community}-${gap.official}`}
                                gap={gap}
                            />
                        ))}
                    </ul>
                </div>
            )}

            {history.length > 1 && (
                <p className="m-0 text-xs opacity-60">
                    {history.length} runs kept in{" "}
                    <code>evals/history.json</code>.
                </p>
            )}
        </div>
    );
}
