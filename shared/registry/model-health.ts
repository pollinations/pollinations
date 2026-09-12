/**
 * Minimal reliability math over the public `model_health` feed.
 *
 * A model is "reliable" when it has enough recent traffic and almost all of
 * it succeeded. Requests rescued by a fallback count as successes; requests
 * the caller broke (4xx) are excluded from the sample instead of dragging
 * the rate down. A model with no usable data is "unknown", never unreliable.
 * Experimental status is tracked elsewhere and stays out of this verdict.
 */

// Share of successful requests required for the "reliable" verdict.
export const RELIABILITY_MIN_SUCCESS_RATE = 0.95;
// Requests below this sample size report "unknown" instead of a verdict.
export const RELIABILITY_MIN_SAMPLES = 20;

/** One row of the public `model_health` pipe, trimmed to what we use. */
export interface ModelHealthRow {
    model: string;
    total_requests: number;
    status_2xx: number;
    errors_4xx: number;
    fallback_rescues: number;
    last_request_at: string | null;
}

/** Per-model health attached to catalog responses. */
export interface ModelHealthSummary {
    success_rate: number;
    sample_count: number;
    window_minutes: number;
    last_request_at: string | null;
}

export type ModelReliability = "reliable" | "unreliable" | "unknown";

export function summarizeModelHealth(
    rows: ModelHealthRow[],
    modelId: string,
    windowMinutes: number,
): ModelHealthSummary | null {
    const row = rows.find((candidate) => candidate.model === modelId);
    if (!row) return null;

    const evaluated = row.total_requests - row.errors_4xx;
    if (evaluated <= 0) return null;

    // Clamp: some pipes already fold rescues into 2xx.
    const successRate = Math.min(
        1,
        (row.status_2xx + row.fallback_rescues) / evaluated,
    );
    return {
        success_rate: Math.round(successRate * 10000) / 10000,
        sample_count: evaluated,
        window_minutes: windowMinutes,
        last_request_at: row.last_request_at,
    };
}

export function modelReliability(
    summary: ModelHealthSummary | null,
): ModelReliability {
    if (!summary || summary.sample_count < RELIABILITY_MIN_SAMPLES) {
        return "unknown";
    }
    return summary.success_rate >= RELIABILITY_MIN_SUCCESS_RATE
        ? "reliable"
        : "unreliable";
}
