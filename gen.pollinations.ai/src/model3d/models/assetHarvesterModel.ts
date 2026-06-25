import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "./inferenceportClient.ts";

const INFERENCEPORT_MODEL_ID = "asset-harvester";

// inferenceport-only — no fal.ai equivalent exists, so there's no fallback
// path here (unlike trellis-2/triposr/sf3d).
export async function callAssetHarvester(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "asset-harvester");

    try {
        const result = await runInferenceportJob({
            model: INFERENCEPORT_MODEL_ID,
            imageUrls: [params.image[0]],
        });
        // asset-harvester is the one inferenceport model that returns PLY
        // (+ an orbit-video preview, not exposed via this endpoint) instead
        // of GLB — confirmed by the provider; every other model is GLB.
        if (!result.plyBase64) {
            throw new InferenceportError(
                "inferenceport asset-harvester returned no PLY output",
            );
        }
        return {
            buffer: base64ToBuffer(result.plyBase64),
            contentType: "model/ply",
        };
    } catch (err) {
        throw toHttpError(err);
    }
}
