import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requirePrompt, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

export const RODIN_FAL_ENDPOINT = "fal-ai/hyper3d/rodin/v2.5/fast";

export async function callRodinFalAPI(
    prompt: string,
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const hasImages = params.image.length > 0;
    if (!hasImages) requirePrompt(prompt, "hyper3d-rodin");

    try {
        const result = await runFalJob({
            endpoint: RODIN_FAL_ENDPOINT,
            input: {
                ...(hasImages ? { image_urls: params.image } : {}),
                ...(prompt.trim() ? { prompt } : {}),
            },
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
