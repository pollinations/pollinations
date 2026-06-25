import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "./inferenceportClient.ts";

const INFERENCEPORT_MODEL_ID = "trellis-2";
const FAL_ENDPOINT = "fal-ai/trellis-2";

// inferenceport (primary) takes "low"/"medium"/"high"; fal.ai's trellis-2
// endpoint (fallback) takes a pixel resolution instead — map our registry
// model id to each provider's expected value.
const INFERENCEPORT_RESOLUTION_BY_MODEL_ID: Record<
    string,
    "low" | "medium" | "high"
> = {
    "trellis-2-low": "low",
    "trellis-2-medium": "medium",
    "trellis-2-high": "high",
};
const FAL_RESOLUTION_BY_MODEL_ID: Record<string, "512" | "1024" | "1536"> = {
    "trellis-2-low": "512",
    "trellis-2-medium": "1024",
    "trellis-2-high": "1536",
};

export async function callTrellis2WithFallback(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "trellis-2");

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
        resolution: INFERENCEPORT_RESOLUTION_BY_MODEL_ID[params.model],
    });
    if (!result.glbBase64) {
        throw new InferenceportError(
            "inferenceport trellis-2 returned no GLB output",
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
        input: {
            image_url: params.image[0],
            resolution: FAL_RESOLUTION_BY_MODEL_ID[params.model],
        },
    });
    const mesh = extractFalModelMesh(result);
    const buffer = await downloadMesh(mesh.url);
    return { buffer, contentType: mesh.content_type || "model/gltf-binary" };
}
