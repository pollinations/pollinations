import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { callDashScopeMultimodalImage } from "../utils/dashScopeImage.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:qwen-image:ops");

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

/**
 * Generates an image using Alibaba DashScope Qwen-Image-Plus (text-to-image)
 */
export async function callQwenImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
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

    return callDashScopeMultimodalImage(
        apiKey,
        requestBody,
        "qwen-image",
        "Qwen Image",
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
        const { buffer, mimeType } = await downloadUserImage(url);
        imageContent.push({
            image: `data:${mimeType};base64,${buffer.toString("base64")}`,
        });
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

    return callDashScopeMultimodalImage(
        apiKey,
        requestBody,
        "qwen-image-edit",
        "Qwen Image Edit",
        progress,
        requestId,
    );
}
