import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requirePrompt, toHttpError } from "../modelUtils.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

export const HUNYUAN3D_FAL_ENDPOINT = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
const FAL_ENDPOINT = HUNYUAN3D_FAL_ENDPOINT;

export async function callHunyuan3dFalAPI(
    prompt: string,
): Promise<Model3dGenerationResult> {
    requirePrompt(prompt, "hunyuan3d-v3");

    try {
        const result = await runFalJob({
            endpoint: FAL_ENDPOINT,
            input: { prompt },
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
