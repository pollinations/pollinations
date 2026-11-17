export type ModelRunStat = {
    model: string;
    avg_cost_usd?: number | null;
    avg_response_ms?: number | null;
};

function formatCost(usd: number): string {
    return `$${Number(usd.toPrecision(2))}`;
}

function plural(n: number, unit: string): string {
    return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function formatDuration(ms: number): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return plural(seconds, "second");
    const rest = seconds % 60;
    const minutes = plural(Math.floor(seconds / 60), "minute");
    return rest ? `${minutes} ${plural(rest, "second")}` : minutes;
}

/** "Average cost per request: $0.42 · about 1 minute 40 seconds", the cost or time alone, or "". */
export function runStatsLine(stat: ModelRunStat | undefined): string {
    const cost =
        stat?.avg_cost_usd && stat.avg_cost_usd > 0
            ? `Average cost per request: ${formatCost(stat.avg_cost_usd)}`
            : "";
    const time =
        stat?.avg_response_ms && stat.avg_response_ms > 0
            ? formatDuration(stat.avg_response_ms)
            : "";
    if (cost && time) return `${cost} · about ${time}`;
    return cost || (time && `About ${time}`);
}
