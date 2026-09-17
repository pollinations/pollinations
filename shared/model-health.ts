// Client-side view of the public `model_route_health` Tinybird pipe, served
// with a shared edge cache at gen `/models/status`. Rollup rows (`is_rollup` 1)
// count what callers experienced after fallbacks; the other rows are routes.
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

const WINDOW_MINUTES = 24 * 60;
// Same thresholds as the model monitor's computeHealthStatus.
const DEGRADED_5XX_PERCENT = 5;
const DOWN_5XX_PERCENT = 20;

/** Rows for the last 24 hours; throws on a non-2xx response. */
export async function fetchModelHealthRows(
    genBaseUrl: string,
): Promise<ModelHealthRow[]> {
    const response = await fetch(
        `${genBaseUrl}/models/status?minutes=${WINDOW_MINUTES}`,
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch model status (${response.status})`);
    }
    const body = (await response.json()) as { data?: ModelHealthRow[] };
    return body.data ?? [];
}

/** Health per model id and category (`text`, `image`, ...) from rollup rows. */
export function modelHealthLookup(
    rows: ModelHealthRow[],
): (model: string, category: string) => ModelHealth {
    const rollups = new Map(
        rows
            .filter((row) => row.is_rollup)
            .map((row) => [`${row.model}\0${row.event_type}`, row]),
    );
    return (model, category) =>
        modelHealthFromRow(rollups.get(`${model}\0generate.${category}`));
}

function modelHealthFromRow(row: ModelHealthRow | undefined): ModelHealth {
    const success = row?.status_2xx ?? 0;
    const errors5xx = row?.errors_5xx ?? 0;
    const requests = success + errors5xx;
    if (requests === 0) {
        return { status: "unknown", requests: 0, successRate: null };
    }
    const percent5xx = (errors5xx / requests) * 100;
    const status =
        percent5xx >= DOWN_5XX_PERCENT
            ? "down"
            : percent5xx >= DEGRADED_5XX_PERCENT
              ? "degraded"
              : "healthy";
    return { status, requests, successRate: (success / requests) * 100 };
}
