/**
 * Generic inferenceport.ai 3D generation client.
 *
 * Two modes:
 * - Sync (blocking endpoint): POST /v1/3d/generations?sync=true → HTTP 200
 *   with data[0].model_glb_b64_bytes inline. Used by GET /3d/{prompt}.
 * - Async (job API): POST /v1/3d/generations → HTTP 202 with job_id, then
 *   poll GET /v1/3d/jobs/{job_id}. Used by POST /3d/generations + GET
 *   /3d/jobs/{id}.
 *
 * Confirmed model value (per provider docs): "trellis2".
 * Confirmed output fields: data[0].model_glb_b64_bytes (live API test).
 * Confirmed pricing: $0.24/$0.29/$0.35 for resolution low/medium/high.
 */

import { getModel3dEnv } from "../env.ts";

const API_BASE = "https://sharktide-lightning.hf.space/v1";

export class InferenceportError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "InferenceportError";
    }
}

type InferenceportJobStatus = "pending" | "processing" | "completed" | "failed";

// Output payload nested under data[0] (confirmed via live API test).
interface InferenceportJobData {
    model_glb_b64_bytes?: string;
    model_ply_b64_bytes?: string;
}

interface InferenceportJob {
    job_id: string;
    status: InferenceportJobStatus;
    error?: string | null;
    data?: InferenceportJobData[];
}

interface InferenceportSyncResponse {
    data: InferenceportJobData[];
}

interface RunOptions {
    model: string;
    imageUrls: string[];
    prompt?: string;
    resolution?: "low" | "medium" | "high";
}

export interface InferenceportSyncResult {
    glbBase64?: string;
    plyBase64?: string;
}

// Single-shot state of an async job — used by the async job API to check
// status without looping.
export type InferenceportJobState =
    | { status: "pending" | "processing"; jobId: string }
    | ({ status: "completed"; jobId: string } & InferenceportSyncResult);

function toJobState(job: InferenceportJob): InferenceportJobState {
    if (job.status === "failed") {
        throw new InferenceportError(job.error || "3D generation failed", 502);
    }
    if (job.status === "completed") {
        const output = job.data?.[0];
        if (!output?.model_glb_b64_bytes && !output?.model_ply_b64_bytes) {
            throw new InferenceportError(
                "3D generation succeeded but output is missing",
            );
        }
        return {
            status: "completed",
            jobId: job.job_id,
            glbBase64: output?.model_glb_b64_bytes,
            plyBase64: output?.model_ply_b64_bytes,
        };
    }
    return { status: job.status, jobId: job.job_id };
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

// Blocking call — waits for inferenceport to complete before responding.
// Used by the GET /3d/{prompt} endpoint.
export async function runInferenceportSync(
    opts: RunOptions,
): Promise<InferenceportSyncResult> {
    const token = requireInferenceportToken();
    const response = await inferenceportFetch<InferenceportSyncResponse>(
        token,
        {
            method: "POST",
            url: `${API_BASE}/3d/generations?sync=true`,
            body: buildBody(opts),
        },
    );
    const output = response.data?.[0];
    if (!output?.model_glb_b64_bytes && !output?.model_ply_b64_bytes) {
        throw new InferenceportError("inferenceport sync returned no output");
    }
    return {
        glbBase64: output?.model_glb_b64_bytes,
        plyBase64: output?.model_ply_b64_bytes,
    };
}

// Submits an async job and returns the job_id immediately.
// Used by POST /3d/generations.
export async function submitInferenceportJob(
    opts: RunOptions,
): Promise<InferenceportJobState> {
    const token = requireInferenceportToken();
    const job = await inferenceportFetch<InferenceportJob>(token, {
        method: "POST",
        url: `${API_BASE}/3d/generations`,
        body: buildBody(opts),
    });
    return toJobState(job);
}

// Single-shot status check — does NOT loop. Used by GET /3d/jobs/{id}.
export async function checkInferenceportJob(
    jobId: string,
): Promise<InferenceportJobState> {
    const token = requireInferenceportToken();
    const job = await inferenceportFetch<InferenceportJob>(token, {
        method: "GET",
        url: `${API_BASE}/3d/jobs/${jobId}`,
    });
    return toJobState(job);
}

async function inferenceportFetch<T>(
    token: string,
    args: {
        method: "GET" | "POST";
        url: string;
        body?: Record<string, unknown>;
    },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (args.body) headers["Content-Type"] = "application/json";

    const response = await fetch(args.url, {
        method: args.method,
        headers,
        body: args.body ? JSON.stringify(args.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        throw new InferenceportError(
            `Inferenceport ${args.method} ${args.url} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
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
