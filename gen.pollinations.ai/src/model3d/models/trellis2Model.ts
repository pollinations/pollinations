import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import {
    InferenceportError,
    runInferenceportSync,
} from "./inferenceportClient.ts";

// Confirmed model value per inferenceport docs: "trellis2" (no hyphen).
export const TRELLIS2_INFERENCEPORT_MODEL_ID = "trellis2";

// Maps our registry model IDs to inferenceport's resolution values.
export const TRELLIS2_INFERENCEPORT_RESOLUTION_BY_MODEL_ID: Record<
    string,
    "low" | "medium" | "high"
> = {
    "trellis-2-low": "low",
    "trellis-2-medium": "medium",
    "trellis-2-high": "high",
};

export async function callTrellis2(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "trellis-2");

    try {
        const result = await runInferenceportSync({
            model: TRELLIS2_INFERENCEPORT_MODEL_ID,
            imageUrls: [params.image[0]],
            resolution:
                TRELLIS2_INFERENCEPORT_RESOLUTION_BY_MODEL_ID[params.model],
        });
        if (!result.glbBase64) {
            throw new InferenceportError("trellis-2 returned no GLB output");
        }
        return {
            buffer: base64ToBuffer(result.glbBase64),
            contentType: "model/gltf-binary",
        };
    } catch (err) {
        throw toHttpError(err);
    }
}
