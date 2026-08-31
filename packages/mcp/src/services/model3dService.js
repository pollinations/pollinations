import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
} from "../utils/coreUtils.js";
import { fetchGeneratedMedia } from "../utils/mediaUtils.js";

async function generate3D(params, context) {
    const { prompt, output, ...options } = params;
    const url = buildUrl(`/3d/${encodeURIComponent(prompt)}`, options);
    const { data, contentType } = await fetchGeneratedMedia(
        url,
        { expectedType: "model", output, timeoutMs: 600000 },
        context,
    );
    if (data === undefined) {
        return createMCPResponse([createTextContent(url)]);
    }
    return createMCPResponse([
        {
            type: "resource",
            resource: { uri: url, mimeType: contentType, blob: data },
        },
    ]);
}

export const model3dTools = [
    [
        "generate3D",
        "Generate a GLB 3D model and return its Gen URL or inline MCP resource.",
        z
            .object({
                prompt: z.string().min(1),
                model: z
                    .string()
                    .optional()
                    .describe("3D model; use listModels"),
                image: z.union([z.string(), z.array(z.string())]).optional(),
                output: z.enum(["url", "inline"]).optional(),
            })
            .passthrough(),
        generate3D,
    ],
];
