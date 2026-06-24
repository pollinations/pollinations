import type { Usage } from "@shared/registry/registry.ts";
import { callHunyuan3dFalAPI } from "./models/hunyuan3dModel.ts";
import { callRodinFalAPI } from "./models/rodinModel.ts";
import { callSf3dWithFallback } from "./models/sf3dModel.ts";
import { callTrellis2FalAPI } from "./models/trellis2Model.ts";
import { callTrellisWithFallback } from "./models/trellisModel.ts";
import { callTripo3dFalAPI } from "./models/tripo3dModel.ts";
import { callTripoSRWithFallback } from "./models/triposrModel.ts";
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
        case "trellis":
            return await callTrellisWithFallback(safeParams);
        case "triposr":
            return await callTripoSRWithFallback(safeParams);
        case "sf3d":
            return await callSf3dWithFallback(safeParams);
        case "tripo3d-h3.1":
            return await callTripo3dFalAPI(prompt, safeParams);
        case "trellis-2-512":
        case "trellis-2-1024":
        case "trellis-2-1536":
            return await callTrellis2FalAPI(safeParams);
        case "hunyuan3d-v3":
            return await callHunyuan3dFalAPI(prompt);
        case "hyper3d-rodin":
        case "hyper3d-rodin-highpack":
            return await callRodinFalAPI(prompt, safeParams);
        default:
            throw new Error(
                `3D generation not supported for model: ${safeParams.model}`,
            );
    }
}
