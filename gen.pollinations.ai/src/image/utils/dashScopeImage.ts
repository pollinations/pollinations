import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "./fetchUpstream.ts";

const logOps = debug("pollinations:dashscope-image:ops");

// DashScope multimodal generation endpoint (synchronous). Shared by the
// Qwen-Image and Wan-Image handlers. Note: wanVideoModel uses a different
// DashScope endpoint and must NOT use this constant.
export const DASHSCOPE_API_BASE =
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

// Only the fields the helper actually reads are typed here; both Qwen and Wan
// responses carry additional optional fields the helper never touches.
interface DashScopeMultimodalImageResponse {
    output?: {
        choices?: Array<{
            message?: {
                content?: Array<{ image?: string }>;
            };
        }>;
    };
    code?: string;
    message?: string;
}

/**
 * Call the DashScope multimodal generation API and return the result.
 * Shared by the Qwen-Image and Wan-Image handlers.
 */
export async function callDashScopeMultimodalImage(
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
    logOps(`${modelLabel} request:`, safeBody);

    const response = await fetchUpstream(DASHSCOPE_API_BASE, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: `${modelLabel} API failed`,
    });

    const data: DashScopeMultimodalImageResponse = await response.json();

    if (data.code) {
        throw new HttpError(
            `${modelLabel} error: ${data.message || data.code}`,
            400,
            undefined,
            DASHSCOPE_API_BASE,
        );
    }

    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
    if (!imageUrl) {
        throw new HttpError(
            `No image URL in ${modelLabel} response`,
            500,
            undefined,
            DASHSCOPE_API_BASE,
        );
    }

    logOps("Image generated, downloading from:", imageUrl);
    progress.updateBar(requestId, 80, "Processing", "Downloading image...");

    const imageResponse = await fetchUpstream(imageUrl, {
        errorLabel: "Failed to download generated image",
    });
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
