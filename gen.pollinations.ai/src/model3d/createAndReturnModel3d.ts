import type { Usage } from "@shared/registry/registry.ts";
import { callRodinFalAPI } from "./models/rodinModel.ts";
import { callTrellis2 } from "./models/trellis2Model.ts";
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
        case "trellis-2-low":
        case "trellis-2-medium":
        case "trellis-2-high":
            return await callTrellis2(safeParams);
        case "hyper3d-rodin":
            return await callRodinFalAPI(prompt, safeParams);
        default:
            throw new Error(
                `3D generation not supported for model: ${safeParams.model}`,
            );
    }
}
