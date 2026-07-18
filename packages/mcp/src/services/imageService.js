import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    arrayBufferToBase64,
    buildUrl,
    chatWithMedia,
    createImageContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
} from "../utils/coreUtils.js";
import { getImageModels } from "../utils/models.js";

/**
 * Build an image request's encoded prompt and query params.
 * Shared by generateImage and generateImageUrl.
 *
 * @param {Object} params - Raw tool params
 * @returns {{encodedPrompt: string, queryParams: Object}}
 */
function prepareImageRequest(params) {
    const {
        prompt,
        model,
        width,
        height,
        seed,
        guidance_scale,
        quality,
        image,
        transparent,
        safe,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = {
        model,
        width,
        height,
        seed,
        guidance_scale,
        quality,
        image,
        transparent,
        safe,
    };

    return { encodedPrompt, queryParams };
}

/**
 * Build a video request's encoded prompt and query params.
 * Shared by generateVideo and generateVideoUrl.
 *
 * @param {Object} params - Raw tool params
 * @returns {{encodedPrompt: string, queryParams: Object}}
 */
function prepareVideoRequest(params) {
    const { prompt, model, duration, aspectRatio, audio, image, seed, safe } =
        params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = {
        model,
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        safe,
    };

    return { encodedPrompt, queryParams };
}

async function generateImageUrl(params) {
    requireApiKey();

    const { prompt, model, width, height, seed, quality } = params;
    const { encodedPrompt, queryParams } = prepareImageRequest(params);

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);
    await fetchBinaryWithAuth(url, { timeoutMs: 300000 });

    return createMCPResponse([
        createTextContent(
            {
                imageUrl: url,
                prompt,
                model,
                width,
                height,
                seed,
                quality,
            },
            true,
        ),
    ]);
}

async function generateImage(params) {
    requireApiKey();

    const { prompt, model, width, height, seed, quality, transparent } = params;
    const { encodedPrompt, queryParams } = prepareImageRequest(params);

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);

    const { buffer, contentType } = await fetchBinaryWithAuth(url);
    const base64Data = arrayBufferToBase64(buffer);

    const metadata = {
        prompt,
        model,
        width,
        height,
        seed,
        quality,
        transparent,
    };

    return createMCPResponse([
        createImageContent(base64Data, contentType),
        createTextContent(
            `Generated image from prompt: "${prompt}"\n\nMetadata: ${JSON.stringify(metadata, null, 2)}`,
        ),
    ]);
}

async function generateVideo(params) {
    requireApiKey();

    const { prompt, model, duration, aspectRatio, audio, image, seed } = params;
    const { encodedPrompt, queryParams } = prepareVideoRequest(params);

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);

    const { buffer, contentType } = await fetchBinaryWithAuth(url);
    const base64Data = arrayBufferToBase64(buffer);

    const metadata = {
        prompt,
        model,
        duration,
        aspectRatio,
        audio,
        hasReferenceImage: !!image,
        seed,
    };

    return createMCPResponse([
        {
            type: "resource",
            resource: {
                uri: `pollinations://video/${Date.now()}`,
                mimeType: contentType || "video/mp4",
                blob: base64Data,
            },
        },
        createTextContent(
            `Generated video from prompt: "${prompt}"\n\nMetadata: ${JSON.stringify(metadata, null, 2)}\n\nVideo returned as base64-encoded resource (decode and save as .mp4)`,
        ),
    ]);
}

async function generateVideoUrl(params) {
    requireApiKey();

    const { prompt, model, duration, aspectRatio, audio, image, seed } = params;
    const { encodedPrompt, queryParams } = prepareVideoRequest(params);

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);
    await fetchBinaryWithAuth(url, { method: "HEAD", timeoutMs: 300000 });

    return createMCPResponse([
        createTextContent(
            {
                videoUrl: url,
                prompt,
                model,
                duration,
                aspectRatio,
                audio,
                hasReferenceImage: !!image,
                seed,
            },
            true,
        ),
    ]);
}

async function describeImage(params) {
    requireApiKey();

    const {
        imageUrl,
        prompt = "Describe this image in detail.",
        model,
    } = params;

    if (!imageUrl || typeof imageUrl !== "string") {
        throw new Error("imageUrl is required and must be a string");
    }

    const { content, model: respondedModel } = await chatWithMedia({
        model,
        prompt,
        mediaType: "image_url",
        mediaUrl: imageUrl,
    });

    return createMCPResponse([
        createTextContent(
            {
                description: content,
                imageUrl,
                model: respondedModel,
                prompt,
            },
            true,
        ),
    ]);
}

async function analyzeVideo(params) {
    requireApiKey();

    const {
        videoUrl,
        prompt = "Describe what happens in this video in detail.",
        model,
    } = params;

    if (!videoUrl || typeof videoUrl !== "string") {
        throw new Error("videoUrl is required and must be a string");
    }

    const { content, model: respondedModel } = await chatWithMedia({
        model,
        prompt,
        mediaType: "video_url",
        mediaUrl: videoUrl,
    });

    return createMCPResponse([
        createTextContent(
            {
                analysis: content,
                videoUrl,
                model: respondedModel,
                prompt,
            },
            true,
        ),
    ]);
}

async function listImageModels(_params) {
    const models = await getImageModels();
    return createMCPResponse([createTextContent(models, true)]);
}

const imageParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the image to generate (required)"),
    model: z
        .string()
        .optional()
        .describe(
            "Image model or alias. Use listImageModels for the live list.",
        ),
    width: z
        .number()
        .int()
        .min(64)
        .max(4096)
        .optional()
        .describe(
            "Image width in pixels (default: 1024). Common sizes: 512, 768, 1024, 1280, 1536, 2048",
        ),
    height: z
        .number()
        .int()
        .min(64)
        .max(4096)
        .optional()
        .describe(
            "Image height in pixels (default: 1024). Common sizes: 512, 768, 1024, 1280, 1536, 2048",
        ),
    seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            "Random seed for reproducible results (default: 42). Use same seed + prompt for identical images",
        ),
    guidance_scale: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe(
            "How closely to follow the prompt (1-20). Higher = more literal, lower = more creative. Default varies by model",
        ),
    quality: z
        .enum(["low", "medium", "high", "hd"])
        .optional()
        .describe(
            "Image quality level (default: 'medium'). 'hd' for maximum quality, 'low' for faster generation",
        ),
    image: z
        .string()
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
        .boolean()
        .optional()
        .describe(
            "Enable safety content filters (default: false). Blocks NSFW content",
        ),
};

const videoParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the video to generate (required)"),
    model: z
        .string()
        .optional()
        .describe(
            "Video model or alias. Use listImageModels for the live list.",
        ),
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
            "Enable audio generation where supported. Check videoCapabilities from listImageModels for per-model support.",
        ),
    image: z
        .string()
        .optional()
        .describe(
            "Reference image URL(s) for image-to-video generation. " +
                "For video models, image[0] is the start frame and image[1] is the end frame when videoCapabilities includes end_frame.",
        ),
    seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Random seed for reproducible results"),
    safe: z
        .boolean()
        .optional()
        .describe("Enable safety content filters (default: false)"),
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
    [
        "describeImage",
        "Analyze and describe an image using vision-capable AI models. " +
            "Pass an image URL and optionally a custom prompt. " +
            "Great for image captioning, content analysis, OCR, and visual Q&A.",
        {
            imageUrl: z
                .string()
                .describe("URL of the image to analyze (required)"),
            prompt: z
                .string()
                .optional()
                .describe(
                    "What to analyze about the image (default: 'Describe this image in detail.'). " +
                        "Examples: 'What text is in this image?', 'What emotions are shown?', 'List all objects'",
                ),
            model: z
                .string()
                .optional()
                .describe("Vision-capable model or alias"),
        },
        describeImage,
    ],
    [
        "analyzeVideo",
        "Analyze a YouTube URL or direct video URL.",
        {
            videoUrl: z
                .string()
                .describe(
                    "URL of the video to analyze. Supports YouTube URLs (youtube.com, youtu.be), " +
                        "direct video URLs (https://...), and Google Cloud Storage (gs://...)",
                ),
            prompt: z
                .string()
                .optional()
                .describe(
                    "What to analyze about the video (default: 'Describe what happens in this video'). " +
                        "Examples: 'Summarize the key points', 'What is being discussed?', 'List all people shown'",
                ),
            model: z
                .string()
                .optional()
                .describe("Video-capable model or alias"),
        },
        analyzeVideo,
    ],
    [
        "listImageModels",
        "Return the live image and video model registry from Gen.",
        {},
        listImageModels,
    ],
];
