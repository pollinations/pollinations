import type { Usage } from "@shared/registry/registry.ts";
import { callAssetHarvester } from "./models/assetHarvesterModel.ts";
import { callRodinFalAPI } from "./models/rodinModel.ts";
import { callTrellis2Fal } from "./models/trellis2FalModel.ts";
import { callTrellis2 } from "./models/trellis2Model.ts";
import { callTripoP2 } from "./models/tripoP2Model.ts";
import type { Model3dParams } from "./params.ts";

export interface Model3dGenerationResult {
    buffer: Buffer;
    contentType: string;
    trackingData?: {
        actualModel?: string;
        usage?: Usage;
    };
}

export async function createAndReturnModel3d(
    prompt: string,
    safeParams: Model3dParams,
): Promise<Model3dGenerationResult> {
    switch (safeParams.model) {
        case "microsoft/trellis-2":
            return await callTrellis2(safeParams);
        case "microsoft/trellis-2:fal":
            return await callTrellis2Fal(safeParams);
        case "nvidia/asset-harvester":
            return await callAssetHarvester(safeParams);
        case "hyper3d/rodin-2.5":
            return await callRodinFalAPI(prompt, safeParams);
        case "tripo3d/p2":
            return await callTripoP2(prompt, safeParams);
        default:
            throw new Error(
                `3D generation not supported for model: ${safeParams.model}`,
            );
    }
}
