/**
 * Generic fal.ai queue API client for 3D generation models.
 *
 * Contract confirmed against fal.ai docs (no precedent client existed in this
 * repo before this file): submit to POST https://queue.fal.run/{endpoint},
 * auth via "Authorization: Key $FAL_KEY", poll the returned status_url until
 * COMPLETED/FAILED, then fetch the returned response_url for the result.
 * fal.ai's 3D-generation models consistently return the mesh under a
 * `model_mesh: { url, content_type, file_name, file_size }` field (confirmed
 * for fal-ai/triposr and fal-ai/trellis/multi; assumed for the others —
 * verify against each model's /api docs page if output extraction fails).
 */

import { sleep } from "../../image/util.ts";
import { getModel3dEnv } from "../env.ts";

const QUEUE_BASE = "https://queue.fal.run";
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 120; // 10 min ceiling for the slowest providers (Rodin HighPack)

export class FalError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "FalError";
    }
}

interface FalQueueSubmitResponse {
    request_id: string;
    status_url: string;
    response_url: string;
}

interface FalQueueStatusResponse {
    status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
}

export interface FalModelMesh {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
}

export interface RunFalJobOptions {
    endpoint: string;
    input: Record<string, unknown>;
}

// Handle returned by submitFalJob — enough to check status and fetch the
// result later without resubmitting.
export interface FalJobHandle {
    requestId: string;
    statusUrl: string;
    responseUrl: string;
}

export type FalJobState =
    | { status: "pending"; handle: FalJobHandle }
    | { status: "completed"; result: Record<string, unknown> };

function requireFalApiKey(): string {
    const apiKey = getModel3dEnv("FAL_KEY");
    if (!apiKey) {
        throw new FalError("FAL_KEY environment variable is required");
    }
    return apiKey;
}

export async function submitFalJob(
    opts: RunFalJobOptions,
): Promise<FalJobHandle> {
    const apiKey = requireFalApiKey();
    const submission = await falFetch<FalQueueSubmitResponse>(apiKey, {
        method: "POST",
        url: `${QUEUE_BASE}/${opts.endpoint}`,
        body: opts.input,
    });
    return {
        requestId: submission.request_id,
        statusUrl: submission.status_url,
        responseUrl: submission.response_url,
    };
}

// Cheap status-only check (no result fetch) — lets callers claim a job
// before paying the cost of downloading its (potentially large) result.
export async function isFalJobReady(handle: FalJobHandle): Promise<boolean> {
    const apiKey = requireFalApiKey();
    const statusResponse = await falFetch<FalQueueStatusResponse>(apiKey, {
        method: "GET",
        url: handle.statusUrl,
    });
    return statusResponse.status === "COMPLETED";
}

export async function fetchFalJobResult(
    handle: FalJobHandle,
): Promise<Record<string, unknown>> {
    const apiKey = requireFalApiKey();
    return await falFetch<Record<string, unknown>>(apiKey, {
        method: "GET",
        url: handle.responseUrl,
    });
}

export async function checkFalJob(handle: FalJobHandle): Promise<FalJobState> {
    if (!(await isFalJobReady(handle))) {
        return { status: "pending", handle };
    }
    const result = await fetchFalJobResult(handle);
    return { status: "completed", result };
}

export async function runFalJob(
    opts: RunFalJobOptions,
): Promise<Record<string, unknown>> {
    const handle = await submitFalJob(opts);

    let pollAttempts = 0;
    let state: FalJobState = { status: "pending", handle };
    while (state.status === "pending") {
        if (pollAttempts >= POLL_MAX_ATTEMPTS) {
            throw new FalError(
                `fal.ai request ${handle.requestId} timed out after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`,
                504,
            );
        }
        await sleep(POLL_INTERVAL_MS);
        state = await checkFalJob(handle);
        pollAttempts++;
    }
    return state.result;
}

// fal.ai's 3D models use either `model_mesh` (triposr, trellis/multi, rodin,
// tripo3d) or `model_glb` (trellis-2, hunyuan-3d) for the primary output file
// — confirmed per-model via each endpoint's /api docs page, no single
// consistent field name across all of fal's 3D catalog.
export function extractFalModelMesh(
    result: Record<string, unknown>,
): FalModelMesh {
    const modelMesh = (result.model_mesh ?? result.model_glb) as
        | FalModelMesh
        | undefined;
    if (!modelMesh?.url) {
        throw new FalError(
            "fal.ai 3D generation succeeded but model_mesh/model_glb output is missing",
        );
    }
    return modelMesh;
}

async function falFetch<T>(
    apiKey: string,
    args: {
        method: "GET" | "POST";
        url: string;
        body?: Record<string, unknown>;
    },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Key ${apiKey}`,
    };
    if (args.body) headers["Content-Type"] = "application/json";

    const response = await fetch(args.url, {
        method: args.method,
        headers,
        body: args.body ? JSON.stringify(args.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "<no body>");
        throw new FalError(
            `fal.ai ${args.method} ${args.url} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
            classifyFalHttpStatus(response.status),
        );
    }
    return (await response.json()) as T;
}

export function classifyFalHttpStatus(httpStatus: number): number {
    // 429 → 429 so clients can back off. 400/422 → pass through (input
    // validation). Other 4xx and all 5xx → 502 (our config / upstream outage).
    if (httpStatus === 429) return 429;
    if (httpStatus === 400 || httpStatus === 422) return httpStatus;
    return 502;
}
