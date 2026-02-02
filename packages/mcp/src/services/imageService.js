import { z } from "zod";
import { getAuthHeaders, requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    arrayBufferToBase64,
    buildShareableUrl,
    buildUrl,
    createImageContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
} from "../utils/coreUtils.js";
import { getImageModels, validateImageModel } from "../utils/models.js";

function buildQueryParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            result[key] = value;
        }
    }
    return result;
}

async function generateImageUrl(params) {
    requireApiKey();

    const {
        prompt,
        model,
        width,
        height,
        seed,
        enhance,
        negative_prompt,
        guidance_scale,
        quality,
        image,
        transparent,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    if (model) {
        const validation = await validateImageModel(model);
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                    `Use listImageModels to see all ${validation.availableCount} available models.`,
            );
        }
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = buildQueryParams({
        model,
        width,
        height,
        seed,
        enhance,
        negative_prompt,
        guidance_scale,
        quality,
        image,
        transparent,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    });

    const authUrl = buildUrl(`/image/${encodedPrompt}`, queryParams, true);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const preGenResponse = await fetch(authUrl, {
            method: "GET",
            headers: getAuthHeaders(),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!preGenResponse.ok) {
            console.warn(
                `Image generation may have failed (${preGenResponse.status}), but URL will still be returned`,
            );
        }
    } catch (err) {
        if (err.name === "AbortError") {
            console.warn(
                "Image generation request timed out, but URL will still be returned",
            );
        } else {
            console.warn(
                "Image generation request failed, URL will still be returned:",
                err.message,
            );
        }
    }

    const shareableUrl = buildShareableUrl(
        `/image/${encodedPrompt}`,
        queryParams,
    );

    return createMCPResponse([
        createTextContent(
            {
                imageUrl: shareableUrl,
                prompt,
                model: model || "flux",
                width: width || 1024,
                height: height || 1024,
                seed,
                quality: quality || "medium",
            },
            true,
        ),
    ]);
}

async function generateImage(params) {
    requireApiKey();

    const {
        prompt,
        model,
        width,
        height,
        seed,
        enhance,
        negative_prompt,
        guidance_scale,
        quality,
        image,
        transparent,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    if (model) {
        const validation = await validateImageModel(model);
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                    `Use listImageModels to see all ${validation.availableCount} available models.`,
            );
        }
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = buildQueryParams({
        model,
        width,
        height,
        seed,
        enhance,
        negative_prompt,
        guidance_scale,
        quality,
        image,
        transparent,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    });

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        const metadata = {
            prompt,
            model: model || "flux",
            width: width || 1024,
            height: height || 1024,
            seed,
            quality: quality || "medium",
            enhance: enhance || false,
            transparent: transparent || false,
        };

        return createMCPResponse([
            createImageContent(base64Data, contentType),
            createTextContent(
                `Generated image from prompt: "${prompt}"\n\nMetadata: ${JSON.stringify(metadata, null, 2)}`,
            ),
        ]);
    } catch (error) {
        console.error("Error generating image:", error);
        throw error;
    }
}

async function generateImageBatch(params) {
    requireApiKey();

    const {
        prompts,
        model,
        width,
        height,
        seed: baseSeed,
        enhance,
        negative_prompt,
        guidance_scale,
        quality,
        image,
        transparent,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    } = params;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
        throw new Error("Prompts array is required and must not be empty");
    }

    if (prompts.length > 10) {
        throw new Error(
            "Maximum 10 images per batch. For more, call multiple times.",
        );
    }

    const results = await Promise.allSettled(
        prompts.map(async (prompt, index) => {
            const encodedPrompt = encodeURIComponent(prompt);
            const queryParams = buildQueryParams({
                model,
                width,
                height,
                seed: baseSeed !== undefined ? baseSeed + index : undefined,
                enhance,
                negative_prompt,
                guidance_scale,
                quality,
                image,
                transparent,
                nologo,
                nofeed,
                safe,
                private: isPrivate,
            });

            const url = buildUrl(`/image/${encodedPrompt}`, queryParams);
            const { buffer, contentType } = await fetchBinaryWithAuth(url);
            const base64Data = arrayBufferToBase64(buffer);

            return {
                index,
                prompt,
                base64: base64Data,
                contentType,
                seed: baseSeed !== undefined ? baseSeed + index : undefined,
            };
        }),
    );

    const responseContent = [];
    const successful = [];
    const failed = [];

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            const img = result.value;
            responseContent.push(
                createImageContent(img.base64, img.contentType),
            );
            successful.push({
                index: img.index,
                prompt: img.prompt,
                seed: img.seed,
            });
        } else {
            failed.push({
                index,
                prompt: prompts[index],
                error: result.reason?.message || "Unknown error",
            });
        }
    });

    responseContent.push(
        createTextContent(
            {
                batch: {
                    total: prompts.length,
                    successful: successful.length,
                    failed: failed.length,
                },
                successful,
                failed: failed.length > 0 ? failed : undefined,
                model: model || "flux",
                width: width || 1024,
                height: height || 1024,
            },
            true,
        ),
    );

    return createMCPResponse(responseContent);
}

async function generateVideo(params) {
    requireApiKey();

    const {
        prompt,
        model = "veo",
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const videoModels = ["veo", "seedance", "seedance-pro"];
    if (!videoModels.includes(model)) {
        throw new Error(
            `Invalid video model "${model}". Available video models: ${videoModels.join(", ")}\n` +
                `- veo: text-to-video, 4/6/8 seconds, supports audio\n` +
                `- seedance: text/image-to-video, 2-10 seconds\n` +
                `- seedance-pro: text/image-to-video, 2-10 seconds, better quality`,
        );
    }

    if (duration !== undefined) {
        if (model === "veo" && ![4, 6, 8].includes(duration)) {
            throw new Error(
                "veo model only supports duration of 4, 6, or 8 seconds",
            );
        }
        if (
            (model === "seedance" || model === "seedance-pro") &&
            (duration < 2 || duration > 10)
        ) {
            throw new Error(
                "seedance models support duration between 2-10 seconds",
            );
        }
    }

    if (audio && model !== "veo") {
        console.warn("Warning: audio parameter is only supported by veo model");
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = buildQueryParams({
        model,
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    });

    const url = buildUrl(`/image/${encodedPrompt}`, queryParams);

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        const metadata = {
            prompt,
            model,
            duration,
            aspectRatio,
            audio: model === "veo" ? audio || false : undefined,
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
    } catch (error) {
        console.error("Error generating video:", error);
        throw error;
    }
}

async function generateVideoUrl(params) {
    requireApiKey();

    const {
        prompt,
        model = "veo",
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const videoModels = ["veo", "seedance", "seedance-pro"];
    if (!videoModels.includes(model)) {
        throw new Error(
            `Invalid video model "${model}". Available video models: ${videoModels.join(", ")}`,
        );
    }

    if (duration !== undefined) {
        if (model === "veo" && ![4, 6, 8].includes(duration)) {
            throw new Error(
                "veo model only supports duration of 4, 6, or 8 seconds",
            );
        }
        if (
            (model === "seedance" || model === "seedance-pro") &&
            (duration < 2 || duration > 10)
        ) {
            throw new Error(
                "seedance models support duration between 2-10 seconds",
            );
        }
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const queryParams = buildQueryParams({
        model,
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        nologo,
        nofeed,
        safe,
        private: isPrivate,
    });

    const authUrl = buildUrl(`/image/${encodedPrompt}`, queryParams, true);

    try {
        const headResponse = await fetch(authUrl, {
            method: "HEAD",
            headers: getAuthHeaders(),
        });
        if (!headResponse.ok) {
            console.warn(
                `Video generation may have failed (${headResponse.status}), but URL will still be returned`,
            );
        }
    } catch (err) {
        console.warn(
            "HEAD request failed, video may not be pre-generated:",
            err.message,
        );
    }

    const shareableUrl = buildShareableUrl(
        `/image/${encodedPrompt}`,
        queryParams,
    );

    return createMCPResponse([
        createTextContent(
            {
                videoUrl: shareableUrl,
                prompt,
                model,
                duration,
                aspectRatio,
                audio: model === "veo" ? audio || false : undefined,
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
        model = "openai",
    } = params;

    if (!imageUrl || typeof imageUrl !== "string") {
        throw new Error("imageUrl is required and must be a string");
    }

    const requestBody = {
        model,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: prompt,
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageUrl,
                        },
                    },
                ],
            },
        ],
    };

    try {
        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response
                .text()
                .catch(() => "Unknown error");
            throw new Error(
                `Failed to analyze image (${response.status}): ${errorText}`,
            );
        }

        const result = await response.json();
        const description = result.choices?.[0]?.message?.content || "";

        return createMCPResponse([
            createTextContent(
                {
                    description,
                    imageUrl,
                    model: result.model || model,
                    prompt,
                },
                true,
            ),
        ]);
    } catch (error) {
        console.error("Error analyzing image:", error);
        throw error;
    }
}

async function analyzeVideo(params) {
    requireApiKey();

    const {
        videoUrl,
        prompt = "Describe what happens in this video in detail.",
        model = "gemini-large",
    } = params;

    if (!videoUrl || typeof videoUrl !== "string") {
        throw new Error("videoUrl is required and must be a string");
    }

    const requestBody = {
        model,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: prompt,
                    },
                    {
                        type: "video_url",
                        video_url: {
                            url: videoUrl,
                        },
                    },
                ],
            },
        ],
    };

    try {
        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response
                .text()
                .catch(() => "Unknown error");
            throw new Error(
                `Failed to analyze video (${response.status}): ${errorText}`,
            );
        }

        const result = await response.json();
        const analysis = result.choices?.[0]?.message?.content || "";

        return createMCPResponse([
            createTextContent(
                {
                    analysis,
                    videoUrl,
                    model: result.model || model,
                    prompt,
                },
                true,
            ),
        ]);
    } catch (error) {
        console.error("Error analyzing video:", error);
        throw error;
    }
}

async function listImageModels(_params) {
    try {
        const models = await getImageModels();

        const imageOnlyModels = models.filter(
            (m) =>
                m.output_modalities?.includes("image") &&
                !m.output_modalities?.includes("video"),
        );
        const videoModels = models.filter((m) =>
            m.output_modalities?.includes("video"),
        );
        const imageToImageModels = models.filter((m) =>
            m.input_modalities?.includes("image"),
        );

        const result = {
            imageModels: imageOnlyModels.map((m) => ({
                name: m.name,
                description: m.description,
                aliases: m.aliases || [],
                inputModalities: m.input_modalities,
                outputModalities: m.output_modalities,
                supportsImageToImage:
                    m.input_modalities?.includes("image") || false,
            })),
            videoModels: videoModels.map((m) => ({
                name: m.name,
                description: m.description,
                aliases: m.aliases || [],
                inputModalities: m.input_modalities,
                outputModalities: m.output_modalities,
                supportsImageToVideo:
                    m.input_modalities?.includes("image") || false,
            })),
            imageToImageCapable: imageToImageModels.map((m) => m.name),
            summary: {
                totalModels: models.length,
                imageModels: imageOnlyModels.length,
                videoModels: videoModels.length,
                imageToImageCapable: imageToImageModels.length,
            },
            usage: {
                image: "Use generateImage or generateImageUrl with image models",
                video: "Use generateVideo with veo, seedance, or seedance-pro",
                imageToImage:
                    "Pass 'image' parameter with a URL to transform existing images",
            },
        };

        return createMCPResponse([createTextContent(result, true)]);
    } catch (error) {
        console.error("Error listing image models:", error);
        throw error;
    }
}

const imageParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the image to generate (required)"),
    model: z
        .string()
        .optional()
        .describe(
            "Image model to use. Options: flux (default, fast), turbo (ultra-fast), gptimage (OpenAI), " +
                "kontext (context-aware, supports i2i), seedream/seedream-pro (high quality, supports i2i), " +
                "nanobanana/nanobanana-pro (Gemini-based), zimage (experimental). Use listImageModels for full list.",
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
    enhance: z
        .boolean()
        .optional()
        .describe(
            "Let AI improve your prompt for better results (default: false). Adds detail and style suggestions",
        ),
    negative_prompt: z
        .string()
        .optional()
        .describe(
            "What to avoid in the image (default: 'worst quality, blurry'). Example: 'blurry, low quality, text, watermark'",
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
            "Reference image URL(s) for image-to-image generation. Separate multiple URLs with | or comma.\n" +
                "I2I models: seedream-pro, nanobanana-pro, nanobanana, gptimage, seedream (all multi-image), kontext (single image).\n" +
                "Put this parameter last in URL or URL-encode it.",
        ),
    transparent: z
        .boolean()
        .optional()
        .describe(
            "Generate with transparent background (default: false). Useful for logos, stickers, overlays",
        ),
    nologo: z
        .boolean()
        .optional()
        .describe("Remove Pollinations watermark from image (default: false)"),
    nofeed: z
        .boolean()
        .optional()
        .describe("Don't add image to public feed (default: false)"),
    safe: z
        .boolean()
        .optional()
        .describe(
            "Enable safety content filters (default: false). Blocks NSFW content",
        ),
    private: z
        .boolean()
        .optional()
        .describe("Hide image from public feeds/gallery (default: false)"),
};

const videoParamsSchema = {
    prompt: z
        .string()
        .describe("Text description of the video to generate (required)"),
    model: z
        .enum(["veo", "seedance", "seedance-pro"])
        .optional()
        .describe(
            "Video model (default: 'veo'):\n" +
                "- veo: Google's model, text/image-to-video, 4/6/8 sec, supports audio, single image input\n" +
                "- seedance: ByteDance, text/image-to-video, 2-10 sec, multi-image support\n" +
                "- seedance-pro: ByteDance Pro, text/image-to-video, 2-10 sec, multi-image, best prompt adherence",
        ),
    duration: z
        .number()
        .int()
        .min(2)
        .max(10)
        .optional()
        .describe(
            "Video duration in seconds:\n" +
                "- veo: 4, 6, or 8 seconds only\n" +
                "- seedance/seedance-pro: 2-10 seconds",
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
            "Enable audio generation (default: false). Only supported by veo model",
        ),
    image: z
        .string()
        .optional()
        .describe(
            "Reference image URL(s) for image-to-video generation. " +
                "veo: single image only. seedance/seedance-pro: multi-image (separate with | or comma).",
        ),
    seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Random seed for reproducible results"),
    nologo: z
        .boolean()
        .optional()
        .describe("Remove Pollinations watermark (default: false)"),
    nofeed: z
        .boolean()
        .optional()
        .describe("Don't add to public feed (default: false)"),
    safe: z
        .boolean()
        .optional()
        .describe("Enable safety content filters (default: false)"),
    private: z
        .boolean()
        .optional()
        .describe("Hide from public feeds (default: false)"),
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
        "Generate an image from a text prompt and return the base64-encoded image data. " +
            "Full control over all generation parameters. Supports image-to-image with kontext, seedream, nanobanana models.",
        imageParamsSchema,
        generateImage,
    ],
    [
        "generateImageBatch",
        "Generate multiple images in parallel (up to 10). Best with sk_ keys (no rate limits). " +
            "pk_ keys will be rate-limited. Each prompt generates one image with shared parameters.",
        {
            prompts: z
                .array(z.string())
                .min(1)
                .max(10)
                .describe(
                    "Array of prompts to generate images for (1-10 prompts). Each prompt generates one image.",
                ),
            model: z.string().optional().describe("Image model for all images"),
            width: z.number().int().optional().describe("Width for all images"),
            height: z
                .number()
                .int()
                .optional()
                .describe("Height for all images"),
            seed: z
                .number()
                .int()
                .optional()
                .describe("Base seed (incremented for each image)"),
            enhance: z.boolean().optional().describe("Enhance all prompts"),
            negative_prompt: z
                .string()
                .optional()
                .describe("Negative prompt for all images"),
            guidance_scale: z
                .number()
                .optional()
                .describe("Guidance scale for all images"),
            quality: z
                .enum(["low", "medium", "high", "hd"])
                .optional()
                .describe("Quality for all images"),
            image: z
                .string()
                .optional()
                .describe("Reference image for all (i2i)"),
            transparent: z
                .boolean()
                .optional()
                .describe("Transparent background for all"),
            nologo: z
                .boolean()
                .optional()
                .describe("Remove watermark from all"),
            nofeed: z.boolean().optional().describe("Don't add any to feed"),
            safe: z.boolean().optional().describe("Safety filters for all"),
            private: z.boolean().optional().describe("Hide all from public"),
        },
        generateImageBatch,
    ],
    [
        "generateVideo",
        "Generate a video from a text prompt or image. " +
            "Models: veo (text-to-video, 4-8s, audio), seedance (text/image-to-video, 2-10s), seedance-pro (best quality). " +
            "Use 'image' parameter with seedance models for image-to-video generation.",
        videoParamsSchema,
        generateVideo,
    ],
    [
        "generateVideoUrl",
        "Generate a video URL from a text prompt. Returns a shareable/embeddable URL without downloading the video. " +
            "Models: veo (4-8s, audio), seedance (2-10s), seedance-pro (best quality).",
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
                .describe(
                    "Vision-capable model to use (default: 'openai'). " +
                        "Options: openai, gemini, claude, grok - all support vision",
                ),
        },
        describeImage,
    ],
    [
        "analyzeVideo",
        "Analyze a video using AI. Supports YouTube URLs and direct video links. " +
            "Uses gemini-large for native video understanding (frames + audio). " +
            "Great for video summarization, content analysis, and Q&A about videos.",
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
                .describe(
                    "Model to use (default: 'gemini-large'). " +
                        "gemini-large and gemini support native video input",
                ),
        },
        analyzeVideo,
    ],
    [
        "listImageModels",
        "List all available image and video generation models with their capabilities. " +
            "Shows which models support image-to-image, video generation, and other features. " +
            "Models are fetched dynamically from the API.",
        {},
        listImageModels,
    ],
];
