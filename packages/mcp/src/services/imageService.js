import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    arrayBufferToBase64,
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchResponseWithAuth,
} from "../utils/coreUtils.js";

function mediaUrl({ prompt, output: _output, ...params }) {
    return buildUrl(`/image/${encodeURIComponent(prompt)}`, params);
}

async function fetchMedia(url, expectedType, context) {
    const response = await fetchResponseWithAuth(
        url,
        { timeoutMs: expectedType === "video" ? 600000 : 300000 },
        context,
    );
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith(`${expectedType}/`)) {
        await response.body?.cancel();
        throw new Error(
            `Expected ${expectedType} response, received ${contentType || "no content type"}`,
        );
    }
    return { response, contentType };
}

async function generateMedia(params, expectedType, context) {
    requireApiKey(context);
    const url = mediaUrl(params);
    const { response, contentType } = await fetchMedia(
        url,
        expectedType,
        context,
    );
    if ((params.output || "url") === "url") {
        await response.body?.cancel();
        return createMCPResponse([createTextContent(url)]);
    }

    const data = arrayBufferToBase64(await response.arrayBuffer());
    if (expectedType === "image") {
        return createMCPResponse([
            { type: "image", data, mimeType: contentType },
        ]);
    }
    return createMCPResponse([
        {
            type: "resource",
            resource: { uri: url, mimeType: contentType, blob: data },
        },
    ]);
}

const output = z
    .enum(["url", "inline"])
    .optional()
    .describe("Return the Gen URL (default) or inline MCP binary content");

const sharedMediaParams = {
    prompt: z.string().min(1),
    model: z
        .string()
        .optional()
        .describe("Model or alias; use listModels for the live registry"),
    image: z.union([z.string(), z.array(z.string())]).optional(),
    seed: z.number().int().optional(),
    safe: z.union([z.boolean(), z.string()]).optional(),
    output,
};

const imageParamsSchema = z
    .object({
        ...sharedMediaParams,
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        guidance_scale: z.number().optional(),
        quality: z.string().optional(),
        transparent: z.boolean().optional(),
    })
    .passthrough();

const videoParamsSchema = z
    .object({
        ...sharedMediaParams,
        duration: z.number().optional(),
        aspectRatio: z.string().optional(),
        audio: z.boolean().optional(),
    })
    .passthrough();

export const imageTools = [
    [
        "generateImage",
        "Generate an image and return its Gen URL or inline MCP image content.",
        imageParamsSchema,
        (params, context) => generateMedia(params, "image", context),
    ],
    [
        "generateVideo",
        "Generate a video and return its Gen URL or inline MCP resource.",
        videoParamsSchema,
        (params, context) => generateMedia(params, "video", context),
    ],
];
