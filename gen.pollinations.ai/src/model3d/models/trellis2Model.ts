import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requireImages, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

const FAL_ENDPOINT = "fal-ai/trellis-2";

const RESOLUTION_BY_MODEL_ID: Record<string, "512" | "1024" | "1536"> = {
    "trellis-2-512": "512",
    "trellis-2-1024": "1024",
    "trellis-2-1536": "1536",
};

export async function callTrellis2FalAPI(
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requireImages(params, "trellis-2");
    const resolution = RESOLUTION_BY_MODEL_ID[params.model];

    try {
        const result = await runFalJob({
            endpoint: FAL_ENDPOINT,
            input: { image_url: params.image[0], resolution },
        });
        const mesh = extractFalModelMesh(result);
        const buffer = await downloadMesh(mesh.url);
        return {
            buffer,
            contentType: mesh.content_type || "model/gltf-binary",
        };
    } catch (err) {
        throw toHttpError(err);
    }
}
