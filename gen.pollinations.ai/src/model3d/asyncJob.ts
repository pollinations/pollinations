/**
 * Async job dispatch for 3D generation — POST /3d/generations + GET
 * /3d/jobs/{job_id}, added per reviewer feedback (sharktide, PR #11979):
 * inferenceport's cheap-hardware models (tripoSR/sf3d) can take up to 5
 * minutes, too long for a single blocking HTTP request to ride out reliably.
 *
 * This proxies the upstream providers' own job/queue APIs directly — both
 * inferenceport and fal.ai are already async queue APIs under the hood — so
 * a "job" here is just a thin pointer to an upstream job, with no long-lived
 * Worker execution required (resolveModel3dJob does ONE fast status check per
 * call, not a poll loop).
 *
 * The existing blocking GET /3d/{prompt} endpoint and its per-model
 * call*WithFallback()/call*FalAPI() functions are unchanged and reuse the
 * same submit/check primitives internally (see e.g. trellis2Model.ts).
 *
 * Fallback scope (v1): inferenceport→fal fallback is decided at submission
 * time only. If inferenceport's job fails after running for a while, the job
 * fails — there's no later retry on fal once it's underway.
 */

import type { Buffer } from "node:buffer";
import { base64ToBuffer } from "../image/utils/imageDownload.ts";
import { ASSET_HARVESTER_INFERENCEPORT_MODEL_ID } from "./models/assetHarvesterModel.ts";
import {
    extractFalModelMesh,
    FalError,
    type FalJobHandle,
    fetchFalJobResult,
    isFalJobReady,
    submitFalJob,
} from "./models/falClient.ts";
import { HUNYUAN3D_FAL_ENDPOINT } from "./models/hunyuan3dModel.ts";
import {
    checkInferenceportJob,
    InferenceportError,
    submitInferenceportJob,
} from "./models/inferenceportClient.ts";
import {
    RODIN_FAL_IMAGE_ENDPOINT,
    RODIN_FAL_TEXT_ENDPOINT,
} from "./models/rodinModel.ts";
import {
    SF3D_FAL_ENDPOINT,
    SF3D_INFERENCEPORT_MODEL_ID,
} from "./models/sf3dModel.ts";
import {
    TRELLIS2_FAL_ENDPOINT,
    TRELLIS2_FAL_RESOLUTION_BY_MODEL_ID,
    TRELLIS2_INFERENCEPORT_MODEL_ID,
    TRELLIS2_INFERENCEPORT_RESOLUTION_BY_MODEL_ID,
} from "./models/trellis2Model.ts";
import { TRIPO3D_FAL_ENDPOINT } from "./models/tripo3dModel.ts";
import {
    TRIPOSR_FAL_ENDPOINT,
    TRIPOSR_INFERENCEPORT_MODEL_ID,
} from "./models/triposrModel.ts";
import {
    downloadMesh,
    requireImages,
    requirePrompt,
    toHttpError,
} from "./modelUtils.ts";
import type { Model3dParams } from "./params.ts";

export type Model3dSubmission =
    | { provider: "inferenceport"; providerJobId: string }
    | ({ provider: "fal"; providerJobId: string } & FalJobHandle);

export type Model3dCheckResult =
    | { status: "pending" }
    | { status: "completed"; buffer: Buffer; contentType: string };

type SubmitRequest =
    | {
          provider: "inferenceport";
          inferenceportModel: string;
          imageUrls: string[];
          prompt?: string;
          resolution?: "low" | "medium" | "high";
          fallback?: { falEndpoint: string; falInput: Record<string, unknown> };
      }
    | {
          provider: "fal";
          falEndpoint: string;
          falInput: Record<string, unknown>;
      };

function buildSubmitRequest(
    resolvedModel: string,
    prompt: string,
    params: Model3dParams,
): SubmitRequest {
    switch (resolvedModel) {
        case "triposr":
            requireImages(params, "triposr");
            return {
                provider: "inferenceport",
                inferenceportModel: TRIPOSR_INFERENCEPORT_MODEL_ID,
                imageUrls: [params.image[0]],
                fallback: {
                    falEndpoint: TRIPOSR_FAL_ENDPOINT,
                    falInput: { image_url: params.image[0] },
                },
            };
        case "sf3d":
            requireImages(params, "sf3d");
            return {
                provider: "inferenceport",
                inferenceportModel: SF3D_INFERENCEPORT_MODEL_ID,
                imageUrls: [params.image[0]],
                fallback: {
                    falEndpoint: SF3D_FAL_ENDPOINT,
                    falInput: { image_url: params.image[0] },
                },
            };
        case "asset-harvester":
            requireImages(params, "asset-harvester");
            return {
                provider: "inferenceport",
                inferenceportModel: ASSET_HARVESTER_INFERENCEPORT_MODEL_ID,
                imageUrls: [params.image[0]],
            };
        case "trellis-2-low":
        case "trellis-2-medium":
        case "trellis-2-high":
            requireImages(params, "trellis-2");
            return {
                provider: "inferenceport",
                inferenceportModel: TRELLIS2_INFERENCEPORT_MODEL_ID,
                imageUrls: [params.image[0]],
                resolution:
                    TRELLIS2_INFERENCEPORT_RESOLUTION_BY_MODEL_ID[
                        resolvedModel
                    ],
                fallback: {
                    falEndpoint: TRELLIS2_FAL_ENDPOINT,
                    falInput: {
                        image_url: params.image[0],
                        resolution:
                            TRELLIS2_FAL_RESOLUTION_BY_MODEL_ID[resolvedModel],
                    },
                },
            };
        case "tripo3d-h3.1":
            requirePrompt(prompt, "tripo3d-h3.1");
            return {
                provider: "fal",
                falEndpoint: TRIPO3D_FAL_ENDPOINT,
                falInput: { prompt, texture: false, pbr: false },
            };
        case "hunyuan3d-v3":
            requirePrompt(prompt, "hunyuan3d-v3");
            return {
                provider: "fal",
                falEndpoint: HUNYUAN3D_FAL_ENDPOINT,
                falInput: { prompt },
            };
        case "hyper3d-rodin":
        case "hyper3d-rodin-highpack": {
            const hasImages = params.image.length > 0;
            if (!hasImages) requirePrompt(prompt, "hyper3d-rodin");
            return {
                provider: "fal",
                falEndpoint: hasImages
                    ? RODIN_FAL_IMAGE_ENDPOINT
                    : RODIN_FAL_TEXT_ENDPOINT,
                falInput: {
                    ...(hasImages ? { image_urls: params.image } : {}),
                    ...(prompt.trim() ? { prompt } : {}),
                    hd_texture: resolvedModel === "hyper3d-rodin-highpack",
                },
            };
        }
        default:
            throw toHttpError(
                new Error(
                    `3D generation not supported for model: ${resolvedModel}`,
                ),
            );
    }
}

export async function submitModel3dJob(
    resolvedModel: string,
    prompt: string,
    params: Model3dParams,
): Promise<Model3dSubmission> {
    const request = buildSubmitRequest(resolvedModel, prompt, params);

    if (request.provider === "fal") {
        try {
            const handle = await submitFalJob({
                endpoint: request.falEndpoint,
                input: request.falInput,
            });
            return {
                provider: "fal",
                providerJobId: handle.requestId,
                ...handle,
            };
        } catch (err) {
            throw toHttpError(err);
        }
    }

    try {
        const state = await submitInferenceportJob({
            model: request.inferenceportModel,
            imageUrls: request.imageUrls,
            prompt: request.prompt,
            resolution: request.resolution,
        });
        return { provider: "inferenceport", providerJobId: state.jobId };
    } catch (err) {
        if (!(err instanceof InferenceportError) || !request.fallback) {
            throw toHttpError(err);
        }
    }

    try {
        const handle = await submitFalJob({
            endpoint: request.fallback.falEndpoint,
            input: request.fallback.falInput,
        });
        return { provider: "fal", providerJobId: handle.requestId, ...handle };
    } catch (err) {
        throw toHttpError(err);
    }
}

/**
 * Checks a job once. `onReady` is called the instant completion is observed
 * upstream, *before* the (potentially slow, for fal — up to ~50MB per the
 * issue) result download. The caller uses it to claim the job in KV right
 * away, so a second poll arriving mid-download sees the claim and backs off
 * instead of re-observing completion and billing again.
 */
export async function checkModel3dJob(
    submission: Model3dSubmission,
    onReady: () => Promise<void>,
): Promise<Model3dCheckResult> {
    try {
        if (submission.provider === "inferenceport") {
            // inferenceport returns the output inline with the status check
            // (no separate download step), so there's no slow gap to claim
            // around — checking and "fetching" are the same cheap call.
            const state = await checkInferenceportJob(submission.providerJobId);
            if (state.status !== "completed") return { status: "pending" };
            await onReady();
            if (state.glbBase64) {
                return {
                    status: "completed",
                    buffer: base64ToBuffer(state.glbBase64),
                    contentType: "model/gltf-binary",
                };
            }
            if (state.plyBase64) {
                return {
                    status: "completed",
                    buffer: base64ToBuffer(state.plyBase64),
                    contentType: "model/ply",
                };
            }
            throw new InferenceportError(
                "inferenceport job completed with no usable output",
            );
        }

        if (!(await isFalJobReady(submission))) return { status: "pending" };
        await onReady();
        const result = await fetchFalJobResult(submission);
        const mesh = extractFalModelMesh(result);
        const buffer = await downloadMesh(mesh.url);
        return {
            status: "completed",
            buffer,
            contentType: mesh.content_type || "model/gltf-binary",
        };
    } catch (err) {
        throw toHttpError(err);
    }
}

export { FalError, InferenceportError };
