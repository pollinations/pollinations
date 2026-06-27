/**
 * Async job dispatch for 3D generation — POST /3d/generations + GET
 * /3d/jobs/{job_id}, added per reviewer feedback (sharktide, PR #11979):
 * long-running jobs should be submittable without blocking a single HTTP
 * request for minutes.
 *
 * Trellis-2 uses inferenceport's async job API (submit → job_id → poll).
 * Rodin uses fal.ai's queue API (submit → request_id → poll).
 *
 * The GET /3d/{prompt} blocking endpoint uses inferenceport's sync API
 * (?sync=true) for trellis-2 — see trellis2Model.ts.
 */

import type { Buffer } from "node:buffer";
import { base64ToBuffer } from "../image/utils/imageDownload.ts";
import {
    extractFalModelMesh,
    FalError,
    type FalJobHandle,
    fetchFalJobResult,
    isFalJobReady,
    submitFalJob,
} from "./models/falClient.ts";
import {
    checkInferenceportJob,
    InferenceportError,
    submitInferenceportJob,
} from "./models/inferenceportClient.ts";
import { RODIN_FAL_ENDPOINT } from "./models/rodinModel.ts";
import {
    TRELLIS2_INFERENCEPORT_MODEL_ID,
    TRELLIS2_INFERENCEPORT_RESOLUTION_BY_MODEL_ID,
} from "./models/trellis2Model.ts";
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
            };
        case "hyper3d-rodin": {
            const hasImages = params.image.length > 0;
            if (!hasImages) requirePrompt(prompt, "hyper3d-rodin");
            return {
                provider: "fal",
                falEndpoint: RODIN_FAL_ENDPOINT,
                falInput: {
                    ...(hasImages ? { image_urls: params.image } : {}),
                    ...(prompt.trim() ? { prompt } : {}),
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
        throw toHttpError(err);
    }
}

/**
 * Checks a job once. `onReady` is called the instant completion is observed
 * upstream, *before* the (potentially slow) result download. The caller uses
 * it to claim the job in KV right away, so a concurrent poll backs off instead
 * of re-observing completion and billing again.
 */
export async function checkModel3dJob(
    submission: Model3dSubmission,
    onReady: () => Promise<void>,
): Promise<Model3dCheckResult> {
    try {
        if (submission.provider === "inferenceport") {
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
