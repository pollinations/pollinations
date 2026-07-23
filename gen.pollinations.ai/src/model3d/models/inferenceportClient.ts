/**
 * inferenceport.ai 3D generation client.
 *
 * Production path uses the async job API:
 *
 *   POST /v1/3d/generations
 *   → returns HTTP 202 with a job_id.
 *
 * Poll:
 *
 *   GET /v1/3d/jobs/{job_id}
 *
 * until completed or failed.
 *
 * Completed jobs return the model inline under data[0].
 */

import { sleep } from "../../image/util.ts";
import { getModel3dEnv } from "../env.ts";

const API_BASE = "https://api.inferenceport.ai/v1";
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 120;

export class InferenceportError extends Error {
    constructor(
        message: string,
        public readonly status: number = 500,
    ) {
        super(message);
        this.name = "InferenceportError";
    }
}

interface InferenceportJobData {
    model_glb_b64_bytes?: string;
    model_ply_b64_bytes?: string;
}

interface InferenceportSubmitResponse {
    job_id: string;
    status: "pending";
    created_at: number;
    poll_url?: string;
}

interface InferenceportJobResponse {
    job_id: string;
    status: "pending" | "processing" | "completed" | "failed";

    model: string;

    created_at: number;
    completed_at: number | null;

    data?: InferenceportJobData[];

    error?: string;
}

interface RunOptions {
    model: string;
    imageUrls: string[];
    resolution?: "low" | "medium" | "high";
}

export interface InferenceportResult {
    glbBase64?: string;
    plyBase64?: string;
}

export interface InferenceportJobHandle {
    jobId: string;
}

export type InferenceportJobState =
    | {
          status: "pending";
          handle: InferenceportJobHandle;
      }
    | {
          status: "completed";
          result: InferenceportResult;
      };

function requireInferenceportToken(): string {
    const token = getModel3dEnv("INFERENCEPORT_API_KEY");
    if (!token) {
        throw new InferenceportError(
            "INFERENCEPORT_API_KEY is not configured",
            401,
        );
    }
    return token;
}

function buildBody(opts: RunOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: opts.model,
        image_urls: opts.imageUrls,
    };
    if (opts.resolution) {
        body.resolution = opts.resolution;
    }
    return body;
}

export async function submitInferenceportJob(
    opts: RunOptions,
): Promise<InferenceportJobHandle> {
    const token = requireInferenceportToken();

    const response = await inferenceportFetch<InferenceportSubmitResponse>(
        token,
        "POST",
        "/3d/generations",
        buildBody(opts),
    );

    return {
        jobId: response.job_id,
    };
}

async function getInferenceportJob(
    handle: InferenceportJobHandle,
): Promise<InferenceportJobResponse> {
    const token = requireInferenceportToken();

    return await inferenceportFetch<InferenceportJobResponse>(
        token,
        "GET",
        `/3d/jobs/${handle.jobId}`,
    );
}

export async function isInferenceportJobReady(
    handle: InferenceportJobHandle,
): Promise<boolean> {
    const job = await getInferenceportJob(handle);

    if (job.status === "failed") {
        throw new InferenceportError(job.error ?? "Inferenceport job failed");
    }

    return job.status === "completed";
}

export async function fetchInferenceportJobResult(
    handle: InferenceportJobHandle,
): Promise<InferenceportResult> {
    const job = await getInferenceportJob(handle);

    if (job.status === "failed") {
        throw new InferenceportError(job.error ?? "Inferenceport job failed");
    }

    if (job.status !== "completed") {
        throw new InferenceportError("Inferenceport job is not completed");
    }

    const output = job.data?.[0];

    if (!output?.model_glb_b64_bytes && !output?.model_ply_b64_bytes) {
        throw new InferenceportError("Inferenceport completed without output");
    }

    return {
        glbBase64: output.model_glb_b64_bytes,
        plyBase64: output.model_ply_b64_bytes,
    };
}

export async function checkInferenceportJob(
    handle: InferenceportJobHandle,
): Promise<InferenceportJobState> {
    if (!(await isInferenceportJobReady(handle))) {
        return {
            status: "pending",
            handle,
        };
    }

    return {
        status: "completed",
        result: await fetchInferenceportJobResult(handle),
    };
}

// Blocking helper that preserves the old call semantics while using
// the new async API under the hood.
export async function runInferenceportJob(
    opts: RunOptions,
): Promise<InferenceportResult> {
    const handle = await submitInferenceportJob(opts);

    let attempts = 0;

    let state: InferenceportJobState = {
        status: "pending",
        handle,
    };

    while (state.status === "pending") {
        if (attempts >= POLL_MAX_ATTEMPTS) {
            throw new InferenceportError(
                `Inferenceport job ${handle.jobId} timed out after ${
                    (POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000
                }s`,
                504,
            );
        }

        await sleep(POLL_INTERVAL_MS);
        state = await checkInferenceportJob(handle);
        attempts++;
    }

    return state.result;
}

async function inferenceportFetch<T>(
    token: string,
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        throw new InferenceportError(
            `Inferenceport ${method} ${path} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
            classifyInferenceportHttpStatus(response.status),
        );
    }

    return (await response.json()) as T;
}

export function classifyInferenceportHttpStatus(httpStatus: number): number {
    // 429 → 429 (rate limit). 402 → 402 (insufficient credits).
    // Other 4xx/5xx → 502 (our config / upstream outage).
    if (httpStatus === 429 || httpStatus === 402) return httpStatus;
    return 502;
}
