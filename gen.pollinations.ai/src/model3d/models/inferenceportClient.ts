/**
 * InferencePort 3D generation client.
 *
 * POST /v1/3d/generations submits an async job. The client polls
 * GET /v1/3d/jobs/{job_id} until data[0].model_glb_b64_bytes is ready.
 *
 * Confirmed model value (per provider docs): "trellis2".
 * Confirmed output fields: data[0].model_glb_b64_bytes (live API test).
 * Confirmed pricing: $0.24/$0.29/$0.35 for resolution low/medium/high.
 */

import { sleep } from "../../image/util.ts";
import { getModel3dEnv } from "../env.ts";

const API_BASE = "https://api.inferenceport.ai/v1";
const POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 5 * 60 * 1_000;
const TIMEOUT_MESSAGE = "InferencePort generation timed out after 300 seconds";

export class InferenceportError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly responseBody?: string,
    ) {
        super(message);
        this.name = "InferenceportError";
    }
}

// Output payload nested under data[0] (confirmed via live API test).
interface InferenceportJobData {
    model_glb_b64_bytes?: string;
    model_ply_b64_bytes?: string;
}

interface InferenceportSubmitResponse {
    job_id?: string;
}

interface InferenceportJobResponse {
    status?: "pending" | "processing" | "completed" | "failed";
    data?: InferenceportJobData[];
    error?: string;
}

interface RunOptions {
    model: string;
    imageUrls: string[];
    prompt?: string;
    resolution?: "low" | "medium" | "high";
}

export interface InferenceportResult {
    glbBase64?: string;
    plyBase64?: string;
}

function requireInferenceportToken(): string {
    const token = getModel3dEnv("INFERENCEPORT_API_KEY");
    if (!token) {
        throw new InferenceportError(
            "INFERENCEPORT_API_KEY environment variable is required",
        );
    }
    return token;
}

function buildBody(opts: RunOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: opts.model,
        image_urls: opts.imageUrls,
    };
    if (opts.prompt) body.prompt = opts.prompt;
    if (opts.resolution) body.resolution = opts.resolution;
    return body;
}

// Pollinations keeps its synchronous public response while the provider job
// runs asynchronously, avoiding InferencePort's synchronous transport timeout.
export async function runInferenceport(
    opts: RunOptions,
): Promise<InferenceportResult> {
    const token = requireInferenceportToken();
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    const submission = await inferenceportFetch<InferenceportSubmitResponse>(
        token,
        "POST",
        "/3d/generations",
        deadline,
        buildBody(opts),
    );

    if (!submission.job_id) {
        throw new InferenceportError("InferencePort returned no job ID", 502);
    }

    while (true) {
        const job = await inferenceportFetch<InferenceportJobResponse>(
            token,
            "GET",
            `/3d/jobs/${submission.job_id}`,
            deadline,
        );

        if (job.status === "completed") {
            const output = job.data?.[0];
            if (!output?.model_glb_b64_bytes && !output?.model_ply_b64_bytes) {
                throw new InferenceportError(
                    "InferencePort completed without output",
                    502,
                );
            }
            return {
                glbBase64: output.model_glb_b64_bytes,
                plyBase64: output.model_ply_b64_bytes,
            };
        }
        if (job.status === "failed") {
            throw new InferenceportError(
                job.error || "InferencePort generation failed",
                502,
            );
        }
        if (job.status !== "pending" && job.status !== "processing") {
            throw new InferenceportError(
                "InferencePort returned an invalid job status",
                502,
            );
        }

        await sleep(Math.min(POLL_INTERVAL_MS, remainingTime(deadline)));
    }
}

async function inferenceportFetch<T>(
    token: string,
    method: "GET" | "POST",
    path: string,
    deadline: number,
    body?: Record<string, unknown>,
): Promise<T> {
    const url = `${API_BASE}${path}`;
    const signal = AbortSignal.timeout(remainingTime(deadline));
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal,
        });
    } catch (error) {
        if (signal.aborted || Date.now() >= deadline) {
            throw new InferenceportError(TIMEOUT_MESSAGE, 504);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new InferenceportError(
            `InferencePort ${method} ${url} failed: ${message}`,
            502,
        );
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        throw new InferenceportError(
            `InferencePort ${method} ${url} failed (HTTP ${response.status}): ${text}`,
            classifyInferenceportHttpStatus(response.status),
            text,
        );
    }
    return (await response.json()) as T;
}

function remainingTime(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new InferenceportError(TIMEOUT_MESSAGE, 504);
    }
    return remaining;
}

export function classifyInferenceportHttpStatus(httpStatus: number): number {
    // 400/422 are request validation failures and should not count against
    // model health. 429 → 429 (rate limit). 402 → 402 (credits).
    if (httpStatus === 400 || httpStatus === 422) return 400;
    if (httpStatus === 429 || httpStatus === 402) return httpStatus;
    // Other 4xx/5xx indicate our config or an upstream outage.
    return 502;
}
