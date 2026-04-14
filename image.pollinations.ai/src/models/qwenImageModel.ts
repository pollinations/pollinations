import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:qwen-image:ops");
const logError = debug("pollinations:qwen-image:error");

// DashScope multimodal generation endpoint (synchronous)
const DASHSCOPE_API_BASE =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

const GENERATION_MODEL = "qwen-image-plus";
const EDITING_MODEL = "qwen-image-edit-plus";

// DashScope only allows specific resolutions for qwen-image-plus
const ALLOWED_SIZES: [number, number][] = [
    [1664, 928],
    [1472, 1104],
    [1328, 1328],
    [1104, 1472],
    [928, 1664],
];

/**
 * Snap requested dimensions to the nearest allowed DashScope size
 */
function snapToAllowedSize(width: number, height: number): [number, number] {
    const ratio = width / height;
    let best = ALLOWED_SIZES[2]; // default to square
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const size of ALLOWED_SIZES) {
        const diff = Math.abs(size[0] / size[1] - ratio);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = size;
        }
    }
    return best;
}

interface QwenImageResponse {
    output?: {
        choices?: Array<{
            finish_reason: string;
            message: {
                role: string;
                content: Array<{ image?: string }>;
            };
        }>;
    };
    usage?: {
        image_count?: number;
        width?: number;
        height?: number;
    };
    request_id?: string;
    code?: string;
    message?: string;
}

/**
 * Generates an image using Alibaba DashScope Qwen-Image-Plus (text-to-image)
 */
export async function callQwenImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "DASHSCOPE_API_KEY is required for Qwen Image model",
            500,
        );
    }

    const hasImage = safeParams.image?.length > 0;

    if (hasImage) {
        return callQwenImageEditInternal(
            prompt,
            safeParams,
            progress,
            requestId,
            apiKey,
        );
    }

    return callQwenImageGenerateInternal(
        prompt,
        safeParams,
        progress,
        requestId,
        apiKey,
    );
}

/**
 * Text-to-image generation via DashScope
 */
async function callQwenImageGenerateInternal(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    apiKey: string,
): Promise<ImageGenerationResult> {
    logOps("Calling Qwen Image Plus (text-to-image):", prompt);
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Generating image with Qwen Image...",
    );

    const [w, h] = snapToAllowedSize(
        safeParams.width || 1024,
        safeParams.height || 1024,
    );

    const requestBody = {
        model: GENERATION_MODEL,
        input: {
            messages: [
                {
                    role: "user",
                    content: [{ text: prompt }],
                },
            ],
        },
        parameters: {
            size: `${w}*${h}`,
            n: 1,
            prompt_extend: true,
            watermark: false,
        },
    };

    return callDashScopeImageAPI(
        apiKey,
        requestBody,
        "qwen-image",
        progress,
        requestId,
    );
}

/**
 * Image editing via DashScope (supports 1-3 input images)
 */
async function callQwenImageEditInternal(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    apiKey: string,
): Promise<ImageGenerationResult> {
    const imageUrls = safeParams.image.slice(0, 3);

    logOps(`Calling Qwen Image Edit (${imageUrls.length} image(s)):`, prompt);
    progress.updateBar(
        requestId,
        25,
        "Processing",
        "Preparing images for Qwen Image Edit...",
    );

    // Download and encode images as base64 data URIs
    const imageContent: Array<{ image: string }> = [];
    for (const url of imageUrls) {
        if (!url) continue;
        const { base64, mimeType } = await downloadImageAsBase64(url);
        imageContent.push({ image: `data:${mimeType};base64,${base64}` });
    }

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Generating edited image with Qwen...",
    );

    const width = safeParams.width || 1024;
    const height = safeParams.height || 1024;

    const requestBody = {
        model: EDITING_MODEL,
        input: {
            messages: [
                {
                    role: "user",
                    content: [...imageContent, { text: prompt }],
                },
            ],
        },
        parameters: {
            size: `${width}*${height}`,
            n: 1,
            prompt_extend: true,
            watermark: false,
        },
    };

    return callDashScopeImageAPI(
        apiKey,
        requestBody,
        "qwen-image-edit",
        progress,
        requestId,
    );
}

/**
 * Call the DashScope multimodal generation API and return the result
 */
async function callDashScopeImageAPI(
    apiKey: string,
    requestBody: Record<string, unknown>,
    actualModel: string,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    // Log request safely (hide base64 data)
    const safeBody = JSON.stringify(requestBody, (key, value) => {
        if (
            key === "image" &&
            typeof value === "string" &&
            value.startsWith("data:")
        ) {
            return "[base64]";
        }
        return value;
    });
    logOps("DashScope image request:", safeBody);

    const response = await fetch(DASHSCOPE_API_BASE, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError("DashScope image API failed:", response.status, errorText);
        throw new HttpError(
            `DashScope image API failed: ${errorText}`,
            response.status,
        );
    }

    const data: QwenImageResponse = await response.json();

    if (data.code) {
        throw new HttpError(
            `DashScope image error: ${data.message || data.code}`,
            400,
        );
    }

    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
    if (!imageUrl) {
        throw new HttpError("No image URL in DashScope response", 500);
    }

    logOps("Image generated, downloading from:", imageUrl);
    progress.updateBar(requestId, 80, "Processing", "Downloading image...");

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new HttpError(
            `Failed to download generated image: ${imageResponse.status}`,
            500,
        );
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(`Image downloaded, size: ${(buffer.length / 1024).toFixed(1)} KB`);
    progress.updateBar(requestId, 95, "Success", "Image generation completed");

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel,
            usage: {
                completionImageTokens: 1, // flat per-image pricing
            },
        },
    };
}
