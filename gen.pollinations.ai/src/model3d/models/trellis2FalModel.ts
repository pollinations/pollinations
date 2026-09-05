import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toUpstreamError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

const RESOLUTION = {
    low: 512,
    medium: 1024,
    high: 1536,
} as const;

export async function callTrellis2Fal(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "trellis-2");

    try {
        const result = await runFalJob({
            endpoint: "fal-ai/trellis-2",
            input: {
                image_url: params.image[0],
                resolution: RESOLUTION[params.resolution],
            },
        });
        const mesh = extractFalModelMesh(result);
        return {
            buffer: await downloadMesh(mesh.url),
            contentType: "model/gltf-binary",
            trackingData: {
                actualModel: "trellis-2-fal",
                usage: { completionImageTokens: 1 },
            },
        };
    } catch (error) {
        throw toUpstreamError(error);
    }
}
