import { UpstreamError } from "@shared/error.ts";
import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import {
    assertGlb,
    downloadMesh,
    requirePrompt,
    toUpstreamError,
} from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJobWithUsage } from "./falClient.ts";

export async function callMeshy71(
    prompt: string,
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requirePrompt(prompt, params.model);
    if (params.image.length || prompt.length > 600) {
        throw new UpstreamError(400, {
            message: "This model accepts text only, up to 600 characters",
        });
    }
    try {
        const { data, billableUnits } = await runFalJobWithUsage({
            endpoint: "meshy/v7.1/text-to-3d",
            input: {
                prompt,
                mode: "full",
                model_type: "standard",
                target_polycount: 10000,
                topology: "triangle",
                should_remesh: true,
                enable_pbr: true,
                enable_prompt_expansion: false,
                geometry_resolution: "standard",
                ...(params.seed === undefined ? {} : { seed: params.seed }),
            },
        });
        const buffer = await downloadMesh(extractFalModelMesh(data).url);
        assertGlb(buffer);
        return {
            buffer,
            contentType: "model/gltf-binary",
            trackingData: {
                // 1.5 fal units × $0.80 = one $1.20 catalog generation.
                // Normalize the reported quantity, never assume one generation.
                usage: { completionImageTokens: billableUnits / 1.5 },
            },
        };
    } catch (error) {
        throw toUpstreamError(error);
    }
}
