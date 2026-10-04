// Shared rollup shape for catalog reliability and time-window diagnostics.
// Rollup rows count what callers experienced after fallbacks, not attempts.
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

// Diagnostic colors are independent of the >80% community discovery cutoff.
const DEGRADED_5XX_PERCENT = 5;
const DOWN_5XX_PERCENT = 20;

/** Discovery is fail-open when there are no recent observations. */
export function isModelReliable(
    successRate: number | null | undefined,
): boolean {
    return successRate == null || successRate > 80;
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
