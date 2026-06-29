import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "./inferenceportClient.ts";

export const SF3D_INFERENCEPORT_MODEL_ID = "sf3d";
// fal.ai slug for Stable Fast 3D used by convention (fal-ai/stable-fast-3d) —
// unverified against fal's docs directly, see plan §4/open items. Confirm
// before relying on this fallback path in production.
export const SF3D_FAL_ENDPOINT = "fal-ai/stable-fast-3d";
const INFERENCEPORT_MODEL_ID = SF3D_INFERENCEPORT_MODEL_ID;
const FAL_ENDPOINT = SF3D_FAL_ENDPOINT;

export async function callSf3dWithFallback(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "sf3d");

    try {
        return await runViaInferenceport(params);
    } catch (err) {
        if (!(err instanceof InferenceportError)) {
            throw toHttpError(err);
        }
        // inferenceport failed — fall back to fal.ai
    }

    try {
        return await runViaFal(params);
    } catch (err) {
        throw toHttpError(err);
    }
}

async function runViaInferenceport(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const result = await runInferenceportJob({
        model: INFERENCEPORT_MODEL_ID,
        imageUrls: [params.image[0]],
    });
    if (!result.glbBase64) {
        throw new InferenceportError(
            "inferenceport sf3d returned no GLB output",
        );
    }
    return {
        buffer: base64ToBuffer(result.glbBase64),
        contentType: "model/gltf-binary",
    };
}

async function runViaFal(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const result = await runFalJob({
        endpoint: FAL_ENDPOINT,
        input: { image_url: params.image[0] },
    });
    const mesh = extractFalModelMesh(result);
    const buffer = await downloadMesh(mesh.url);
    return { buffer, contentType: mesh.content_type || "model/gltf-binary" };
}
