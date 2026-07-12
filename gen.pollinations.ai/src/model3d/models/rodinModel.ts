import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requirePrompt, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

// fal's image-to-3D endpoint 422s on text-only input (image_urls is required
// there) — text-only requests must go to the dedicated text-to-3D endpoint.
// Confirmed against fal's /api docs for both endpoints.
export const RODIN_IMAGE_ENDPOINT = "fal-ai/hyper3d/rodin/v2.5/fast";
export const RODIN_TEXT_ENDPOINT = "fal-ai/hyper3d/rodin/v2.5/text-to-3d/fast";

export async function callRodinFalAPI(
    prompt: string,
    params: Model3dParams,
): Promise<Model3dGenerationResult> {
    const hasImages = params.image.length > 0;
    if (!hasImages) requirePrompt(prompt, "hyper3d-rodin");

    try {
        const seedInput =
            params.seed !== undefined ? { seed: params.seed } : {};
        const result = await runFalJob(
            hasImages
                ? {
                      endpoint: RODIN_IMAGE_ENDPOINT,
                      input: {
                          image_urls: params.image,
                          ...(prompt.trim() ? { prompt } : {}),
                          ...seedInput,
                      },
                  }
                : {
                      endpoint: RODIN_TEXT_ENDPOINT,
                      input: { prompt, ...seedInput },
                  },
        );
        const mesh = extractFalModelMesh(result);
        const buffer = await downloadMesh(mesh.url);
        // fal's mesh.content_type isn't consistently "model/gltf-binary"
        // (sometimes application/octet-stream) even though the file is a GLB
        // by default (we don't pass geometry_file_format), so pin the
        // content-type the same way trellis2Model.ts does — this also keeps
        // model3dCache's "model/" content-type check matching for both models.
        return {
            buffer,
            contentType: "model/gltf-binary",
        };
    } catch (err) {
        throw toHttpError(err);
    }
}
