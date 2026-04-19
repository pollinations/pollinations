import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";

const logOps = debug("pollinations:xai:ops");
const logError = debug("pollinations:xai:error");

const XAI_API_URL = "https://api.x.ai/v1/images/generations";

const ASPECT_RATIOS: Array<{ ratio: number; label: string }> = [
    { ratio: 1 / 1, label: "1:1" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 4 / 3, label: "4:3" },
    { ratio: 3 / 4, label: "3:4" },
    { ratio: 3 / 2, label: "3:2" },
    { ratio: 2 / 3, label: "2:3" },
];

function closestAspectRatio(
    width: number | undefined,
    height: number | undefined,
): string | undefined {
    if (!width || !height) return undefined;
    const requested = width / height;
    return ASPECT_RATIOS.reduce((best, ar) =>
        Math.abs(requested - ar.ratio) < Math.abs(requested - best.ratio)
            ? ar
            : best,
    ).label;
}

/**
 * Calls the xAI official image API.
 * modelId should be "grok-imagine-image" (basic) or "grok-imagine-image-pro" (pro).
 */
export async function callXaiImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    modelId: string = "grok-imagine-image",
): Promise<ImageGenerationResult> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "XAI_API_KEY environment variable is required",
            500,
        );
    }

    logOps(`Calling xAI image API (${modelId}) with prompt:`, prompt);
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Generating with Grok Imagine...",
    );

    const requestBody: Record<string, unknown> = {
        model: modelId,
        prompt,
        n: 1,
        response_format: "url",
    };

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    logOps("Request body:", JSON.stringify(requestBody));

    const response = await fetch(XAI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError("xAI request failed:", response.status, errorText);
        throw new HttpError(
            `xAI image generation failed: ${errorText}`,
            response.status,
        );
    }

    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    const result = data.data?.[0];

    if (!result?.url) {
        throw new HttpError("xAI returned no image URL", 500);
    }

    logOps("Downloading result from URL:", result.url);
    progress.updateBar(requestId, 70, "Processing", "Downloading result...");

    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) {
        throw new HttpError(
            `Failed to download xAI result: ${imageResponse.status}`,
            500,
        );
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    progress.updateBar(
        requestId,
        90,
        "Success",
        "Grok Imagine generation completed",
    );

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel:
                modelId === "grok-imagine-image-pro"
                    ? "grok-imagine-pro"
                    : "grok-imagine",
            usage: {
                completionImageTokens: 1,
            },
        },
    };
}
