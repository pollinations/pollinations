import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchAndUploadMedia,
} from "../utils/coreUtils.js";
import { validateModel3d } from "../utils/models.js";

async function generate3D(params, context) {
    requireApiKey(context);

    if (params.model) {
        const validation = await validateModel3d(params.model, context);
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                    "Use listModels with type=3d to see all available models.",
            );
        }
    }

    const { prompt, ...options } = params;
    const { contentType, mediaUrl } = await fetchAndUploadMedia(
        buildUrl(`/3d/${encodeURIComponent(prompt)}`, options),
        {},
        context,
    );
    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "Generated 3D model",
            mimeType: contentType || "model/gltf-binary",
        },
        createTextContent({ url: mediaUrl, prompt, ...options }, true),
    ]);
}

export const model3dTools = [
    [
        "generate3D",
        "Generate a GLB 3D model and return an unlisted media.pollinations.ai resource link.",
        {
            prompt: z
                .string()
                .min(1)
                .describe(
                    "Text prompt. Image-only models ignore it but still require a value",
                ),
            model: z
                .string()
                .optional()
                .describe("3D model. Use listModels with type=3d"),
            image: z
                .union([z.string(), z.array(z.string())])
                .optional()
                .describe("Reference image URL or URLs"),
            resolution: z.enum(["low", "medium", "high"]).optional(),
            seed: z.number().int().optional(),
            safe: z.union([z.string(), z.boolean()]).optional(),
        },
        generate3D,
    ],
];
