import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestByRatio } from "../utils/aspectRatio.ts";
import { callDashScopeMultimodalImage } from "../utils/dashScopeImage.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:qwen-image:ops");

const GENERATION_MODEL = "qwen-image-plus";
const EDITING_MODEL = "qwen-image-edit-plus";

// DashScope only allows specific resolutions for qwen-image-plus
const ALLOWED_SIZES = [
    [1664, 928],
    [1472, 1104],
    [1328, 1328],
    [1104, 1472],
    [928, 1664],
].map(([width, height]) => ({ width, height, ratio: width / height }));

/**
 * Generates an image using Alibaba DashScope Qwen-Image-Plus (text-to-image)
 */
export async function callQwenImageAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("DASHSCOPE_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "DASHSCOPE_API_KEY is required for Qwen Image model",
            500,
        );
    }

    const hasImage = safeParams.image?.length > 0;

    if (hasImage) {
        return callQwenImageEditInternal(prompt, safeParams, apiKey);
    }

    return callQwenImageGenerateInternal(prompt, safeParams, apiKey);
}

/**
 * Text-to-image generation via DashScope
 */
async function callQwenImageGenerateInternal(
    prompt: string,
    safeParams: ImageParams,
    apiKey: string,
): Promise<ImageGenerationResult> {
    logOps("Calling Qwen Image Plus (text-to-image):", prompt);

    const { width: w, height: h } = closestByRatio(
        safeParams.width || 1024,
        safeParams.height || 1024,
        ALLOWED_SIZES,
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

    return callDashScopeMultimodalImage(
        apiKey,
        requestBody,
        "qwen-image",
        "Qwen Image",
    );
}

/**
 * Image editing via DashScope (supports 1-3 input images)
 */
async function callQwenImageEditInternal(
    prompt: string,
    safeParams: ImageParams,
    apiKey: string,
): Promise<ImageGenerationResult> {
    const imageUrls = safeParams.image.slice(0, 3);

    logOps(`Calling Qwen Image Edit (${imageUrls.length} image(s)):`, prompt);

    // Download and encode images as base64 data URIs
    const imageContent: Array<{ image: string }> = [];
    for (const url of imageUrls) {
        if (!url) continue;
        const { buffer, mimeType } = await downloadUserImage(url);
        imageContent.push({
            image: `data:${mimeType};base64,${buffer.toString("base64")}`,
        });
    }

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

    return callDashScopeMultimodalImage(
        apiKey,
        requestBody,
        "qwen-image-edit",
        "Qwen Image Edit",
    );
}
