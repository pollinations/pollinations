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
        readonly predictionId?: string,
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
    metrics?: { predict_time?: number };
}

interface RunOptions<TInput> {
    model: string; // "owner/name"
    version?: string; // optional pinned version hash
    input: TInput;
}

interface RunResult<TOutput> {
    output: TOutput;
    predictTimeSeconds: number;
    id: string;
    status: "succeeded";
}

export async function runReplicatePrediction<TInput, TOutput>(
    opts: RunOptions<TInput>,
): Promise<RunResult<TOutput>> {
    const token = getImageEnv("REPLICATE_API_TOKEN");
    if (!token) {
        throw new Error("REPLICATE_API_TOKEN environment variable is required");
    }

    const { model, version, input } = opts;

    // Two endpoints exist:
    //   - POST /v1/models/{owner}/{name}/predictions  → official models, latest version (no hash needed)
    //   - POST /v1/predictions                        → community models OR pinned version (requires `version` hash)
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
            undefined,
            prediction.id,
        );
    }
    if (prediction.output === undefined || prediction.output === null) {
        throw new ReplicateError(
            "Prediction succeeded but output is missing",
            undefined,
            prediction.id,
        );
    }

    return {
        output: prediction.output,
        predictTimeSeconds: prediction.metrics?.predict_time ?? 0,
        id: prediction.id,
        status: "succeeded",
    };
}

interface FetchArgs {
    method: "GET" | "POST";
    url: string;
    body?: Record<string, unknown>;
    prefer?: string;
}

async function replicateFetch<T>(
    token: string,
    { method, url, body, prefer }: FetchArgs,
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (body) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new ReplicateError(
            `Replicate ${method} ${url} failed (HTTP ${response.status}): ${await safeText(response)}`,
            response.status,
        );
    }
    return (await response.json()) as T;
}

async function safeText(response: Response): Promise<string> {
    try {
        return (await response.text()).slice(0, 300);
    } catch {
        return "<no body>";
    }
}
