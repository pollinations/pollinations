export type ModelRunStat = {
    model: string;
    avg_cost_usd?: number | null;
    avg_response_ms?: number | null;
};

export function formatRunCost(usd?: number | null): string | undefined {
    if (usd == null || usd <= 0) return;
    return `$${Number(usd.toPrecision(2))}`;
}

export function formatRunTime(ms?: number | null): string | undefined {
    if (ms == null || ms <= 0) return;
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
