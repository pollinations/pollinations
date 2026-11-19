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

export function fastModelsByTime(stats: ModelRunStat[]) {
    const measured = stats
        .flatMap((stat) => {
            const value = stat.avg_response_ms;
            return typeof value === "number" &&
                Number.isFinite(value) &&
                value > 0
                ? [{ id: stat.model, value }]
                : [];
        })
        .sort((a, b) => a.value - b.value);
    const minimumModels = 4;
    const fraction = 0.25;
    const maximumMedianRatio = 0.75;
    if (measured.length < minimumModels) return new Set<string>();
    const cutoff = measured[Math.ceil(measured.length * fraction) - 1].value;
    const middle = (measured.length - 1) / 2;
    const median =
        (measured[Math.floor(middle)].value +
            measured[Math.ceil(middle)].value) /
        2;
    return new Set(
        cutoff <= median * maximumMedianRatio
            ? measured
                  .filter((item) => item.value <= cutoff)
                  .map((item) => item.id)
            : [],
    );
}
