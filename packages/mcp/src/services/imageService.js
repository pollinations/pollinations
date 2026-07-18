import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    arrayBufferToBase64,
    buildUrl,
    createImageContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
} from "../utils/coreUtils.js";

function mediaUrl({ prompt, ...params }) {
    return buildUrl(`/image/${encodeURIComponent(prompt)}`, params);
}

async function generateImageUrl(params) {
    requireApiKey();
    const url = mediaUrl(params);
    await fetchBinaryWithAuth(url, { timeoutMs: 300000 });
    return createMCPResponse([createTextContent(url)]);
}

async function generateImage(params) {
    requireApiKey();
    const url = mediaUrl(params);
    const { buffer, contentType } = await fetchBinaryWithAuth(url);
    return createMCPResponse([
        createImageContent(arrayBufferToBase64(buffer), contentType),
    ]);
}

async function generateVideo(params) {
    requireApiKey();
    const url = mediaUrl(params);
    const { buffer, contentType } = await fetchBinaryWithAuth(url);
    return createMCPResponse([
        {
            type: "resource",
            resource: {
                uri: `pollinations://video/${Date.now()}`,
                mimeType: contentType || "video/mp4",
                blob: arrayBufferToBase64(buffer),
            },
        },
    ]);
}

async function generateVideoUrl(params) {
    requireApiKey();
    const url = mediaUrl(params);
    await fetchBinaryWithAuth(url, { method: "HEAD", timeoutMs: 300000 });
    return createMCPResponse([createTextContent(url)]);
}

const imageParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the image to generate (required)"),
    model: z
        .string()
        .optional()
        .describe("Image model or alias. Use listModels for the live list."),
    width: z
        .number()
        .int()
        .optional()
        .describe("Image width in pixels; support and defaults vary by model"),
    height: z
        .number()
        .int()
        .optional()
        .describe("Image height in pixels; support and defaults vary by model"),
    seed: z
        .number()
        .int()
        .optional()
        .describe("Random seed for reproducible results; use -1 for random"),
    guidance_scale: z
        .number()
        .optional()
        .describe("Prompt guidance scale; support and range vary by model"),
    quality: z
        .string()
        .optional()
        .describe("Image quality; supported values vary by model"),
    image: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
            "Reference image URL(s) for image-to-image generation. Supported inputs depend on model.",
        ),
    transparent: z
        .boolean()
        .optional()
        .describe(
            "Generate with transparent background (default: false). Useful for logos, stickers, overlays",
        ),
    safe: z
        .union([z.boolean(), z.string()])
        .optional()
        .describe(
            "Safety mode: boolean or comma-separated feature names accepted by Gen",
        ),
};

const videoParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the video to generate (required)"),
    model: z.string().describe("Video model or alias. Use listModels."),
    duration: z
        .number()
        .int()
        .optional()
        .describe(
            "Video duration in seconds. Supported values depend on model.",
        ),
    aspectRatio: z
        .string()
        .optional()
        .describe(
            "Video aspect ratio. Examples: '16:9' (landscape), '9:16' (portrait/vertical), '1:1' (square)",
        ),
    audio: z
        .boolean()
        .optional()
        .describe(
            "Enable audio generation where supported. Check listModels for model capabilities.",
        ),
    image: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
            "Reference image URL(s) for image-to-video generation. " +
                "For video models, image[0] is the start frame and image[1] is the end frame when videoCapabilities includes end_frame.",
        ),
    seed: z
        .number()
        .int()
        .optional()
        .describe("Random seed for reproducible results; use -1 for random"),
    safe: z
        .union([z.boolean(), z.string()])
        .optional()
        .describe("Safety mode accepted by Gen"),
};

export const imageTools = [
    [
        "generateImageUrl",
        "Generate an image URL from a text prompt. Returns a shareable/embeddable URL without downloading the image. " +
            "Supports all image models and parameters including image-to-image with the 'image' parameter.",
        imageParamsSchema,
        generateImageUrl,
    ],
    [
        "generateImage",
        "Generate an image from a text prompt and return base64-encoded image data.",
        imageParamsSchema,
        generateImage,
    ],
    [
        "generateVideo",
        "Generate a video from a text prompt or reference image and return base64-encoded video data.",
        videoParamsSchema,
        generateVideo,
    ],
    [
        "generateVideoUrl",
        "Generate a video and return its shareable URL.",
        videoParamsSchema,
        generateVideoUrl,
    ],
];
