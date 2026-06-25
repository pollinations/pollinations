/**
 * Generic inferenceport.ai 3D generation client.
 *
 * Submits to POST /v1/3d/generations (default async mode, not ?sync=true —
 * async matches our own internal polling loop and is the documented default),
 * then polls GET /v1/3d/jobs/{job_id} until a terminal status. Token from
 * INFERENCEPORT_API_KEY.
 *
 * Confirmed `model` values (per provider): "tripoSR", "sf3d", "trellis-2",
 * "asset-harvester". Output format is GLB (model_glb_b64_bytes) for every
 * model except asset-harvester, which returns PLY (+ an orbit-video preview,
 * not exposed via our endpoint) — confirmed by the provider.
 *
 * Confirmed pricing (USD/generation): tripoSR $0.02, sf3d $0.02,
 * asset-harvester $0.07, trellis-2 $0.24/$0.29/$0.35 for resolution
 * low/medium/high (resolution is sent as a request field, not encoded in the
 * `model` value).
 */

import { sleep } from "../../image/util.ts";
import { getModel3dEnv } from "../env.ts";

const API_BASE = "https://sharktide-lightning.hf.space/v1";
const POLL_INTERVAL_MS = 5000;
// Inferenceport docs state jobs typically complete in 1-5 min; cap generously
// so a stuck job surfaces as a controlled 504 instead of running until the
// Worker is killed.
const POLL_MAX_ATTEMPTS = 90;

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

interface InferenceportJob {
    job_id: string;
    status: InferenceportJobStatus;
    error?: string | null;
    model_glb_b64_bytes?: string;
    model_ply_b64_bytes?: string;
    orbit_video_b64_bytes?: string;
}

interface RunOptions {
    model: string;
    imageUrls: string[];
    prompt?: string;
    // trellis-2 only: "low" | "medium" | "high", controls output quality/price.
    resolution?: "low" | "medium" | "high";
}

export interface InferenceportResult {
    glbBase64?: string;
    plyBase64?: string;
    orbitVideoBase64?: string;
    jobId: string;
}

export async function runInferenceportJob(
    opts: RunOptions,
): Promise<InferenceportResult> {
    const token = getModel3dEnv("INFERENCEPORT_API_KEY");
    if (!token) {
        throw new InferenceportError(
            "INFERENCEPORT_API_KEY environment variable is required",
        );
    }

    const body: Record<string, unknown> = {
        model: opts.model,
        image_urls: opts.imageUrls,
    };
    if (opts.prompt) body.prompt = opts.prompt;
    if (opts.resolution) body.resolution = opts.resolution;

    let job = await inferenceportFetch<InferenceportJob>(token, {
        method: "POST",
        url: `${API_BASE}/3d/generations`,
        body,
    });

    let pollAttempts = 0;
    while (job.status === "pending" || job.status === "processing") {
        if (pollAttempts >= POLL_MAX_ATTEMPTS) {
            throw new InferenceportError(
                `Inferenceport job ${job.job_id} timed out after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (status=${job.status})`,
                504,
            );
        }
        await sleep(POLL_INTERVAL_MS);
        job = await inferenceportFetch<InferenceportJob>(token, {
            method: "GET",
            url: `${API_BASE}/3d/jobs/${job.job_id}`,
        });
        pollAttempts++;
    }

    if (job.status === "failed") {
        throw new InferenceportError(job.error || "3D generation failed", 502);
    }
    if (!job.model_glb_b64_bytes && !job.model_ply_b64_bytes) {
        throw new InferenceportError(
            "3D generation succeeded but output is missing",
        );
    }

    return {
        glbBase64: job.model_glb_b64_bytes,
        plyBase64: job.model_ply_b64_bytes,
        orbitVideoBase64: job.orbit_video_b64_bytes,
        jobId: job.job_id,
    };
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

    // 202 (async job accepted) and 200 (poll result) are both success.
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
    // 429 → 429 (rate limit, client can back off).
    // 402 → 402 (insufficient inferenceport credits — our operational concern,
    // not the user's input, but worth a distinct status for monitoring).
    // Other 4xx/5xx → 502 (our config / upstream outage).
    if (httpStatus === 429 || httpStatus === 402) return httpStatus;
    return 502;
}
