import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:wan-image:ops");
const logError = debug("pollinations:wan-image:error");

// DashScope multimodal generation endpoint (synchronous)
const DASHSCOPE_API_BASE =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

// Wan 2.7 model IDs on DashScope
const WAN_IMAGE_MODEL = "wan2.7-image";
const WAN_IMAGE_PRO_MODEL = "wan2.7-image-pro";

// Pixel limits per model variant and mode
// wan2.7-image: all scenarios 768*768 to 2048*2048, aspect ratio 1:8 to 8:1
// wan2.7-image-pro text-to-image: 768*768 to 4096*4096, aspect ratio 1:8 to 8:1
// wan2.7-image-pro other: 768*768 to 2048*2048, aspect ratio 1:8 to 8:1
const MIN_SIDE = 768;

function clampDimensions(
    width: number,
    height: number,
    isPro: boolean,
    hasImage: boolean,
): [number, number] {
    const maxTotal = isPro && !hasImage ? 4096 * 4096 : 2048 * 2048;
    const maxSide = isPro && !hasImage ? 4096 : 2048;

    // Clamp individual sides
    let w = Math.max(MIN_SIDE, Math.min(width, maxSide));
    let h = Math.max(MIN_SIDE, Math.min(height, maxSide));

    // Enforce aspect ratio 1:8 to 8:1
    const ratio = w / h;
    if (ratio > 8) h = Math.ceil(w / 8);
    else if (ratio < 1 / 8) w = Math.ceil(h / 8);

    // Scale down if total pixels exceed max
    const total = w * h;
    if (total > maxTotal) {
        const scale = Math.sqrt(maxTotal / total);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);
    }

    return [w, h];
}

interface WanImageResponse {
    output?: {
        choices?: Array<{
            finish_reason: string;
            message: {
                role: string;
                content: Array<{ image?: string; type?: string }>;
            };
        }>;
        finished?: boolean;
    };
    usage?: {
        image_count?: number;
        size?: string;
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
    };
    request_id?: string;
    code?: string;
    message?: string;
}

/**
 * Generates an image using Alibaba DashScope Wan 2.7 Image
 */
export async function callWanImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    isPro = false,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("DASHSCOPE_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "DASHSCOPE_API_KEY is required for Wan Image model",
            500,
        );
    }

    const hasImage = safeParams.image?.length > 0;
    const model = isPro ? WAN_IMAGE_PRO_MODEL : WAN_IMAGE_MODEL;
    const modelLabel = isPro ? "Wan 2.7 Image Pro" : "Wan 2.7 Image";

    const content: Array<{ text?: string; image?: string }> = [];

    // Add input images if present (up to 9)
    if (hasImage) {
        const imageUrls = safeParams.image.slice(0, 9);
        logOps(`${modelLabel} editing with ${imageUrls.length} image(s)`);
        progress.updateBar(
            requestId,
            25,
            "Processing",
            `Preparing images for ${modelLabel}...`,
        );

        for (const url of imageUrls) {
            if (!url) continue;
            const { buffer, mimeType } = await downloadUserImage(url);
            content.push({
                image: `data:${mimeType};base64,${buffer.toString("base64")}`,
            });
        }
    }

    content.push({ text: prompt });

    const [w, h] = clampDimensions(
        safeParams.width || 1024,
        safeParams.height || 1024,
        isPro,
        hasImage,
    );

    logOps(`Calling ${modelLabel} (${w}x${h}):`, prompt);
    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Generating image with ${modelLabel}...`,
    );

    const parameters: Record<string, unknown> = {
        size: `${w}*${h}`,
        n: 1,
        watermark: false,
    };

    // Enable thinking mode for pro text-to-image (improves quality)
    if (isPro && !hasImage) {
        parameters.thinking_mode = true;
    }

    const requestBody = {
        model,
        input: {
            messages: [
                {
                    role: "user",
                    content,
                },
            ],
        },
        parameters,
    };

    return callDashScopeWanImageAPI(
        apiKey,
        requestBody,
        isPro ? "wan-image-pro" : "wan-image",
        modelLabel,
        progress,
        requestId,
    );
}

/**
 * Call the DashScope multimodal generation API and return the result
 */
async function callDashScopeWanImageAPI(
    apiKey: string,
    requestBody: Record<string, unknown>,
    actualModel: string,
    modelLabel: string,
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
    logOps("DashScope Wan image request:", safeBody);

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
        logError(`${modelLabel} API failed:`, response.status, errorText);
        throw new HttpError(
            `${modelLabel} API failed: ${errorText}`,
            response.status,
        );
    }

    const data: WanImageResponse = await response.json();

    if (data.code) {
        throw new HttpError(
            `${modelLabel} error: ${data.message || data.code}`,
            400,
        );
    }

    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
    if (!imageUrl) {
        throw new HttpError(`No image URL in ${modelLabel} response`, 500);
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
