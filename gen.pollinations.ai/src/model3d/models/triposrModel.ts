import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "./inferenceportClient.ts";

const INFERENCEPORT_MODEL_ID = "tripoSR";
const FAL_ENDPOINT = "fal-ai/triposr";

export async function callTripoSRWithFallback(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "triposr");

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
    // TripoSR only uses the first image_urls element; ignores additional ones.
    const result = await runInferenceportJob({
        model: INFERENCEPORT_MODEL_ID,
        imageUrls: [params.image[0]],
    });
    if (!result.glbBase64) {
        throw new InferenceportError(
            "inferenceport tripoSR returned no GLB output",
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
