import type { Model3dGenerationResult } from "../createAndReturnModel3d.ts";
import { downloadMesh, requirePrompt, toHttpError } from "../modelUtils.ts";
import type { Model3dParams } from "../params.ts";
import { extractFalModelMesh, runFalJob } from "./falClient.ts";

const FAL_ENDPOINT = "tripo3d/h3.1/text-to-3d";

export async function callTripo3dFalAPI(
    prompt: string,
    _params: Model3dParams,
): Promise<Model3dGenerationResult> {
    requirePrompt(prompt, "tripo3d-h3.1");

    try {
        const result = await runFalJob({
            endpoint: FAL_ENDPOINT,
            input: {
                prompt,
                // Registry models this as the "no-texture" variant.
                texture: false,
                pbr: false,
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
