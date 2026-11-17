import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { assertGlb, toUpstreamError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { InferenceportError, runInferenceport } from "./inferenceportClient.ts";

// InferencePort uses this case-sensitive ID in POST /v1/3d/generations.
export const TRIPOSR_INFERENCEPORT_MODEL_ID = "tripoSR";

export async function callTripoSR(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    if (params.image.length !== 1 || !params.image[0]) {
        throw toUpstreamError(
            new InferenceportError(
                "TripoSR requires exactly one reference image",
                400,
            ),
        );
    }

    try {
        const result = await runInferenceport({
            model: TRIPOSR_INFERENCEPORT_MODEL_ID,
            imageUrls: [params.image[0]],
        });
        if (!result.glbBase64) {
            throw new InferenceportError("TripoSR returned no GLB output", 502);
        }
        const buffer = base64ToBuffer(result.glbBase64);
        assertGlb(buffer);
        return {
            buffer,
            contentType: "model/gltf-binary",
            trackingData: {
                usage: { completionImageTokens: 1 },
                ...(result.cost === undefined
                    ? {}
                    : { providerBilling: { units: result.cost, unitCost: 1 } }),
            },
        };
    } catch (error) {
        throw toUpstreamError(error);
    }
}
