/**
 * inferenceport.ai 3D generation client — sync mode only.
 *
 * POST /v1/3d/generations?sync=true → HTTP 200 with data[0].model_glb_b64_bytes inline.
 * Used by GET /3d/{prompt}.
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

// Output payload nested under data[0] (confirmed via live API test).
interface InferenceportJobData {
    model_glb_b64_bytes?: string;
    model_ply_b64_bytes?: string;
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
        `${API_BASE}/3d/generations?sync=true`,
        buildBody(opts),
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

async function inferenceportFetch<T>(
    token: string,
    url: string,
    body: Record<string, unknown>,
): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        throw new InferenceportError(
            `Inferenceport POST ${url} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
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
