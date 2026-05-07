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
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
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

    while (
        prediction.status === "starting" ||
        prediction.status === "processing"
    ) {
        await sleep(POLL_INTERVAL_MS);
        prediction = await replicateFetch<ReplicatePrediction<TOutput>>(token, {
            method: "GET",
            url: pollUrl,
        });
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new ReplicateError(
            prediction.error || `Prediction ${prediction.status}`,
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
        throw new ReplicateError(
            `Replicate ${args.method} ${args.url} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
            response.status,
        );
    }
    return (await response.json()) as T;
}
