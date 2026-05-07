/**
 * Generic Replicate prediction client.
 *
 * Uses Prefer: wait=60 for synchronous attempts, falls back to polling
 * /v1/predictions/{id} on processing status. Token from REPLICATE_API_TOKEN.
 *
 * Replicate has no public token CRUD API — rotation is semi-automated via
 * tools/scripts/rotation/rotate-genai-replicate.sh.
 */

import { getImageEnv } from "../env.ts";
import { sleep } from "../util.ts";

const API_BASE = "https://api.replicate.com/v1";
const DEFAULT_PREFER_WAIT_SECONDS = 60;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const POLL_BACKOFF_CAP_MS = 5000;
const DEFAULT_TIMEOUT_MS = 240_000; // 4 minutes
const MAX_RATE_LIMIT_RETRIES = 3;

export class ReplicateAuthError extends Error {
    readonly status = 401 as const;
    constructor(message: string) {
        super(message);
        this.name = "ReplicateAuthError";
    }
}

export class ReplicateRateLimitError extends Error {
    readonly status = 429 as const;
    constructor(message: string) {
        super(message);
        this.name = "ReplicateRateLimitError";
    }
}

export class ReplicateTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ReplicateTimeoutError";
    }
}

export class ReplicateModelError extends Error {
    constructor(
        message: string,
        readonly predictionId?: string,
    ) {
        super(message);
        this.name = "ReplicateModelError";
    }
}

interface ReplicatePrediction<TOutput> {
    id: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    output?: TOutput;
    error?: string | null;
    urls?: { get?: string; cancel?: string };
    metrics?: { predict_time?: number };
}

interface RunOptions<TInput> {
    model: string; // "owner/name" or "owner/name:version"
    version?: string; // optional pinned version hash
    input: TInput;
    preferWaitSeconds?: number;
    pollIntervalMs?: number;
    timeoutMs?: number;
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

    const {
        model,
        version,
        input,
        preferWaitSeconds = DEFAULT_PREFER_WAIT_SECONDS,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = opts;

    const startedAt = Date.now();

    // Two endpoints exist:
    //   - POST /v1/models/{owner}/{name}/predictions  → official models, latest version (no hash needed)
    //   - POST /v1/predictions                        → community models OR pinned version (requires `version` hash)
    // Pick by whether the caller pinned a version.
    const body: Record<string, unknown> = { input };
    if (version) body.version = version;

    const initial = await postPrediction<TOutput>({
        token,
        model,
        body,
        preferWaitSeconds,
        usePinnedVersion: Boolean(version),
    });

    if (initial.status === "succeeded") {
        return finalize(initial);
    }
    if (initial.status === "failed" || initial.status === "canceled") {
        throw new ReplicateModelError(
            initial.error || `Prediction ${initial.status}`,
            initial.id,
        );
    }

    // Poll until terminal or timeout
    const pollUrl =
        initial.urls?.get || `${API_BASE}/predictions/${initial.id}`;
    let delay = pollIntervalMs;
    while (Date.now() - startedAt < timeoutMs) {
        await sleep(delay);
        delay = Math.min(delay * 1.1, POLL_BACKOFF_CAP_MS);

        const polled = await fetchJson<ReplicatePrediction<TOutput>>({
            url: pollUrl,
            token,
            method: "GET",
        });
        if (polled.status === "succeeded") return finalize(polled);
        if (polled.status === "failed" || polled.status === "canceled") {
            throw new ReplicateModelError(
                polled.error || `Prediction ${polled.status}`,
                polled.id,
            );
        }
    }

    throw new ReplicateTimeoutError(
        `Prediction ${initial.id} did not complete within ${timeoutMs}ms`,
    );
}

function finalize<TOutput>(
    prediction: ReplicatePrediction<TOutput>,
): RunResult<TOutput> {
    if (prediction.output === undefined || prediction.output === null) {
        throw new ReplicateModelError(
            "Prediction succeeded but output is missing",
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

interface PostArgs {
    token: string;
    model: string;
    body: Record<string, unknown>;
    preferWaitSeconds: number;
    usePinnedVersion: boolean;
}

async function postPrediction<TOutput>({
    token,
    model,
    body,
    preferWaitSeconds,
    usePinnedVersion,
}: PostArgs): Promise<ReplicatePrediction<TOutput>> {
    // Official models endpoint when no version is pinned, else generic endpoint with version in body.
    const url = usePinnedVersion
        ? `${API_BASE}/predictions`
        : `${API_BASE}/models/${model}/predictions`;
    const payload = usePinnedVersion ? { ...body, version: body.version } : body;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Prefer: `wait=${preferWaitSeconds}`,
            },
            body: JSON.stringify(payload),
        });

        if (response.status === 401) {
            throw new ReplicateAuthError(
                `Replicate auth failed: ${await safeText(response)}`,
            );
        }
        if (response.status === 429) {
            const retryAfter = Number(response.headers.get("Retry-After")) || 1;
            lastError = new ReplicateRateLimitError(
                `Rate limited by Replicate (retry-after=${retryAfter}s)`,
            );
            if (attempt === MAX_RATE_LIMIT_RETRIES) break;
            await sleep(Math.max(retryAfter, 1) * 1000);
            continue;
        }
        if (!response.ok) {
            throw new ReplicateModelError(
                `Replicate POST /predictions failed (HTTP ${response.status}): ${await safeText(response)}`,
            );
        }
        return (await response.json()) as ReplicatePrediction<TOutput>;
    }
    throw lastError instanceof Error
        ? lastError
        : new ReplicateRateLimitError("Rate limit retries exhausted");
}

interface FetchArgs {
    url: string;
    token: string;
    method: "GET";
}

async function fetchJson<T>({ url, token, method }: FetchArgs): Promise<T> {
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
    if (response.status === 401) {
        throw new ReplicateAuthError(
            `Replicate auth failed: ${await safeText(response)}`,
        );
    }
    if (!response.ok) {
        throw new ReplicateModelError(
            `Replicate ${method} ${url} failed (HTTP ${response.status}): ${await safeText(response)}`,
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
