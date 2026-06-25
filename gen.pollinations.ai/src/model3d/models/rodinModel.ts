import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requirePrompt, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

export const RODIN_FAL_IMAGE_ENDPOINT = "fal-ai/hyper3d/rodin/v2.5/fast";
export const RODIN_FAL_TEXT_ENDPOINT =
    "fal-ai/hyper3d/rodin/v2.5/text-to-3d/fast";
const FAL_IMAGE_ENDPOINT = RODIN_FAL_IMAGE_ENDPOINT;
const FAL_TEXT_ENDPOINT = RODIN_FAL_TEXT_ENDPOINT;

export async function callRodinFalAPI(
    prompt: string,
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const hasImages = params.image.length > 0;
    if (!hasImages) requirePrompt(prompt, "hyper3d-rodin");

    // HighPack: 4K textures + high-poly output via the `hd_texture` addon.
    const hdTexture = params.model === "hyper3d-rodin-highpack";

    try {
        const result = await runFalJob({
            endpoint: hasImages ? FAL_IMAGE_ENDPOINT : FAL_TEXT_ENDPOINT,
            input: {
                ...(hasImages ? { image_urls: params.image } : {}),
                ...(prompt.trim() ? { prompt } : {}),
                hd_texture: hdTexture,
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
