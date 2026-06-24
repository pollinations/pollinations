import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "./inferenceportClient.ts";

// Inferenceport's confirmed `model` value for Trellis is "trellis-2" (not the
// literal string "trellis") — do not confuse with the separate fal-only
// trellis-2-512/1024/1536 registry entries, which are a different product.
const INFERENCEPORT_MODEL_ID = "trellis-2";
const FAL_ENDPOINT = "fal-ai/trellis/multi";

export async function callTrellisWithFallback(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "trellis");

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
        imageUrls: params.image,
    });
    if (result.glbBase64) {
        return {
            buffer: base64ToBuffer(result.glbBase64),
            contentType: "model/gltf-binary",
        };
    }
    // trellis-2's output format on inferenceport is unconfirmed (see plan §4)
    // — handle a PLY fallback in case GLB isn't returned.
    if (result.plyBase64) {
        return {
            buffer: base64ToBuffer(result.plyBase64),
            contentType: "model/ply",
        };
    }
    throw new InferenceportError(
        "inferenceport trellis-2 returned no usable output",
    );
}

async function runViaFal(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const result = await runFalJob({
        endpoint: FAL_ENDPOINT,
        input: { image_urls: params.image },
    });
    const mesh = extractFalModelMesh(result);
    const buffer = await downloadMesh(mesh.url);
    return { buffer, contentType: mesh.content_type || "model/gltf-binary" };
}
