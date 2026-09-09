import { base64ToBuffer } from "../../image/utils/imageDownload.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { requireImages, toUpstreamError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { InferenceportError, runInferenceport } from "./inferenceportClient.ts";

export const ASSET_HARVESTER_INFERENCEPORT_MODEL_ID = "asset-harvester";

export async function callAssetHarvester(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "nvidia/asset-harvester");

    try {
        const result = await runInferenceport({
            model: ASSET_HARVESTER_INFERENCEPORT_MODEL_ID,
            imageUrls: [params.image[0]],
        });
        if (!result.plyBase64) {
            throw new InferenceportError(
                "nvidia/asset-harvester returned no PLY output",
            );
        }
        return {
            buffer: base64ToBuffer(result.plyBase64),
            contentType: "model/ply",
        };
    } catch (err) {
        throw toUpstreamError(err);
    }
}
