import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { requireImages, toUpstreamError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { InferenceportError, runInferenceport } from "./inferenceportClient.ts";

// InferencePort model values for Stability AI's image-to-3D models.
export const SF3D_INFERENCEPORT_MODEL_ID = "sf3d";
export const TRIPOSR_INFERENCEPORT_MODEL_ID = "tripoSR";

async function callStabilityImageTo3d(
    params: Model3dParams,
    label: string,
    model: string,
): Promise<Model3dGenerationResult> {
    requireImages(params, label);

    try {
        const result = await runInferenceport({
            model,
            imageUrls: [params.image[0]],
        });
        if (!result.glbBase64) {
            throw new InferenceportError(`${label} returned no GLB output`);
        }
        return {
            buffer: base64ToBuffer(result.glbBase64),
            contentType: "model/gltf-binary",
            trackingData: {
                usage: { completionImageTokens: 1 },
                ...(result.cost !== undefined
                    ? { providerBilling: { units: result.cost, unitCost: 1 } }
                    : {}),
            },
        };
    } catch (err) {
        throw toUpstreamError(err);
    }
}

export function callSf3d(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    return callStabilityImageTo3d(
        params,
        "stability-ai/sf3d",
        SF3D_INFERENCEPORT_MODEL_ID,
    );
}

export function callTripoSr(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    return callStabilityImageTo3d(
        params,
        "stability-ai/triposr",
        TRIPOSR_INFERENCEPORT_MODEL_ID,
    );
}
