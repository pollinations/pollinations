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

export async function callTripoP2(
    prompt: string,
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requirePrompt(prompt, params.model);
    if (params.image.length || prompt.length > 1024) {
        throw new UpstreamError(400, {
            message: "This model accepts text only, up to 1024 characters",
        });
    }
    try {
        const { data, billableUnits } = await runFalJobWithUsage({
            endpoint: "tripo3d/p2/text-to-3d",
            input: {
                prompt,
                face_limit: 10000,
                quad: false,
                texture: true,
                pbr: true,
                texture_quality: "standard",
                texture_version: "v3.5-20260815",
                export_uv: true,
                ...(params.seed === undefined
                    ? {}
                    : {
                          image_seed: params.seed,
                          model_seed: params.seed,
                          texture_seed: params.seed,
                      }),
            },
        });
        const buffer = await downloadMesh(extractFalModelMesh(data).url);
        assertGlb(buffer);
        return {
            buffer,
            contentType: "model/gltf-binary",
            trackingData: {
                // 110 fal credits × $0.01 = one $1.10 catalog generation.
                // Normalize the reported quantity, never assume one generation.
                usage: { completionImageTokens: billableUnits / 110 },
            },
        };
    } catch (error) {
        throw toUpstreamError(error);
    }
}
