// One row of the public `model_route_health` Tinybird pipe, served with a
// shared edge cache at gen `/models/status`. Rollup rows (`is_rollup` 1) count
// what callers experienced after fallbacks; the other rows are single routes.
export type ModelHealthRow = {
    model?: string;
    event_type?: string;
    is_rollup?: number | boolean;
    status_2xx?: number;
    errors_5xx?: number;
};

export type ModelHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type ModelHealth = {
    status: ModelHealthStatus;
    requests: number;
    /** Percentage of 2xx among 2xx + 5xx, or null without requests. */
    successRate: number | null;
};

export const MODEL_HEALTH_WINDOW_MINUTES = 24 * 60;

export function modelHealthFromRow(
    row: ModelHealthRow | undefined,
): ModelHealth {
    const success = row?.status_2xx ?? 0;
    const errors5xx = row?.errors_5xx ?? 0;
    const requests = success + errors5xx;
    if (requests === 0) {
        return { status: "unknown", requests: 0, successRate: null };
    }
    const successRate = (success / requests) * 100;
    const pct5xx = (errors5xx / requests) * 100;
    const status =
        pct5xx >= 50 ? "down" : pct5xx >= 10 ? "degraded" : "healthy";
    return { status, requests, successRate };
}

/** Rollup rows keyed by model id and event type (`generate.text`, ...). */
export function modelHealthRollups(
    rows: ModelHealthRow[],
): Map<string, ModelHealthRow> {
    return new Map(
        rows
            .filter((row) => row.is_rollup)
            .map((row) => [
                modelHealthKey(row.model ?? "", row.event_type ?? ""),
                row,
            ]),
    );
}

export const modelHealthKey = (model: string, eventType: string) =>
    `${model}\0${eventType}`;
