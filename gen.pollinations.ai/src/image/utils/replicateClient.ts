/**
 * Generic Replicate prediction client.
 *
 * Submits via Prefer: wait=60 and polls every 5s until the prediction reaches
 * a terminal status. Token from REPLICATE_API_TOKEN.
 *
 * Replicate has no public token CRUD API — rotation is semi-automated via
 * tools/scripts/rotation/rotate-genai-replicate.sh.
 */

import { getImageEnv } from "../env.ts";
import { sleep } from "../util.ts";

const API_BASE = "https://api.replicate.com/v1";
const PREFER_WAIT_SECONDS = 60;
const POLL_INTERVAL_MS = 5000;
// Cap total poll time so a stuck prediction surfaces as a controlled 504
// instead of consuming Worker time until the runtime kills the request.
// Seedance 2.0 typical wall time is 40-90s; 5min covers slow runs + queueing.
const POLL_MAX_ATTEMPTS = 60;

export class ReplicateError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "ReplicateError";
    }
}

interface ReplicatePrediction<TOutput> {
    id: string;
    status:
        | "starting"
        | "processing"
        | "succeeded"
        | "failed"
        | "canceled"
        | "aborted";
    output?: TOutput;
    error?: string | null;
    urls?: { get?: string };
    metrics?: {
        predict_time?: number;
        video_output_duration_seconds?: number;
    };
}

interface RunOptions<TInput> {
    model: string;
    version?: string;
    input: TInput;
}

interface RunResult<TOutput> {
    output: TOutput;
    id: string;
    predictTimeSeconds: number;
    videoOutputDurationSeconds?: number;
}

export async function runReplicatePrediction<TInput, TOutput>(
    opts: RunOptions<TInput>,
): Promise<RunResult<TOutput>> {
    const token = getImageEnv("REPLICATE_API_TOKEN");
    if (!token) {
        throw new Error("REPLICATE_API_TOKEN environment variable is required");
    }

    const { model, version, input } = opts;

    // Two endpoints: POST /v1/models/{owner}/{name}/predictions for official
    // models (no version), POST /v1/predictions for pinned version in body.
    const url = version
        ? `${API_BASE}/predictions`
        : `${API_BASE}/models/${model}/predictions`;
    const body: Record<string, unknown> = { input };
    if (version) body.version = version;

    let prediction = await replicateFetch<ReplicatePrediction<TOutput>>(token, {
        method: "POST",
        url,
        body,
        prefer: `wait=${PREFER_WAIT_SECONDS}`,
    });
    const pollUrl =
        prediction.urls?.get || `${API_BASE}/predictions/${prediction.id}`;

    let pollAttempts = 0;
    while (
        prediction.status === "starting" ||
        prediction.status === "processing"
    ) {
        if (pollAttempts >= POLL_MAX_ATTEMPTS) {
            throw new ReplicateError(
                `Replicate prediction ${prediction.id} timed out after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (status=${prediction.status})`,
                504,
            );
        }
        await sleep(POLL_INTERVAL_MS);
        prediction = await replicateFetch<ReplicatePrediction<TOutput>>(token, {
            method: "GET",
            url: pollUrl,
        });
        pollAttempts++;
    }

    if (
        prediction.status === "failed" ||
        prediction.status === "canceled" ||
        prediction.status === "aborted"
    ) {
        const message = prediction.error || `Prediction ${prediction.status}`;
        throw new ReplicateError(
            message,
            classifyReplicatePredictionError(message),
        );
    }
    if (prediction.output === undefined || prediction.output === null) {
        throw new ReplicateError("Prediction succeeded but output is missing");
    }

    return {
        output: prediction.output,
        id: prediction.id,
        predictTimeSeconds: prediction.metrics?.predict_time ?? 0,
        videoOutputDurationSeconds:
            prediction.metrics?.video_output_duration_seconds,
    };
}

async function replicateFetch<T>(
    token: string,
    args: {
        method: "GET" | "POST";
        url: string;
        body?: Record<string, unknown>;
        prefer?: string;
    },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (args.body) headers["Content-Type"] = "application/json";
    if (args.prefer) headers.Prefer = args.prefer;

    const response = await fetch(args.url, {
        method: args.method,
        headers,
        body: args.body ? JSON.stringify(args.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        // 429 passes through so clients can back off. Everything else upstream
        // (auth, validation of our request, Replicate outages) maps to 502 —
        // the failure is on our side of the boundary, not the user's input.
        throw new ReplicateError(
            `Replicate ${args.method} ${args.url} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
            classifyReplicateHttpStatus(response.status),
        );
    }
    return (await response.json()) as T;
}

export function classifyReplicateHttpStatus(httpStatus: number): number {
    // 429 → 429 so clients can back off.
    // 400/422 → pass through; Replicate uses these for input validation
    // (bad model params, invalid image url, etc.) — surfacing them lets
    // the user fix their request instead of seeing a generic 502.
    // Other 4xx (401/403/404) and all 5xx → 502 (our config / upstream outage).
    if (httpStatus === 429) return 429;
    if (httpStatus === 400 || httpStatus === 422) return httpStatus;
    return 502;
}

/**
 * Replicate returns prediction failures as HTTP 200 + error string with no
 * structured code field. Patterns observed in our prod logs:
 * - E005 / "flagged as sensitive" — Seedance content filter (400)
 * - "Input validation error:" — Replicate's input URL fetcher (400)
 * Default 500 keeps new failure modes loud.
 */
export function classifyReplicatePredictionError(message: string): number {
    if (/\bE005\b|flagged as sensitive/i.test(message)) return 400;
    if (/^Input validation error:/i.test(message)) return 400;
    return 500;
}
