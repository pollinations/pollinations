import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestAspectRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:xai:ops");

const XAI_GENERATE_URL = "https://api.x.ai/v1/images/generations";
const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";

/**
 * Calls the xAI official image API.
 * modelId is "grok-imagine-image" or "grok-imagine-image-2.0".
 *
 * When `safeParams.image` contains reference image URLs, the request is
 * routed to /v1/images/edits for image-to-image generation. xAI's edits
 * endpoint requires application/json (NOT multipart/form-data — explicitly
 * called out in xAI's docs as a divergence from the OpenAI SDK). Every
 * reference goes in the `images` array, which takes up to 5 sources.
 */
export async function callXaiImageAPI(
    prompt: string,
    safeParams: ImageParams,
    modelId: string = "grok-imagine-image",
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("XAI_API_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "XAI_API_KEY environment variable is required",
        });
    }

    const isEditMode = safeParams.image.length > 0;
    const endpoint = isEditMode ? XAI_EDITS_URL : XAI_GENERATE_URL;

    logOps(
        `Calling xAI image API (${modelId}, ${isEditMode ? "edit" : "generate"} mode) with prompt:`,
        prompt,
    );

    const requestBody: Record<string, unknown> = {
        model: modelId,
        prompt,
        n: 1,
        response_format: "url",
    };

    if (modelId === "grok-imagine-image") {
        requestBody.resolution = "2k";
    } else {
        // Grok Imagine Image 2.0: low or medium quality (checked in params).
        requestBody.resolution = safeParams.resolution === "2k" ? "2k" : "1k";
        requestBody.quality = safeParams.quality;
    }

    if (isEditMode) {
        requestBody.images = safeParams.image.map((url) => ({
            url,
            type: "image_url",
        }));
    }

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    logOps("Request body:", JSON.stringify(requestBody));

    const response = await fetchUpstream(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        errorLabel: "xAI image generation failed",
    });

    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    const result = data.data?.[0];

    if (!result?.url) {
        throw UpstreamError.fromProvider(500, {
            message: "xAI returned no image URL",
            requestUrl: new URL(endpoint),
        });
    }

    logOps("Downloading result from URL:", result.url);

    const imageResponse = await fetchUpstream(result.url, {
        errorLabel: "Failed to download xAI result",
    });
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
        buffer,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                ...(isEditMode
                    ? { promptImageTokens: safeParams.image.length }
                    : {}),
                completionImageTokens: 1,
            },
        },
    };
}
