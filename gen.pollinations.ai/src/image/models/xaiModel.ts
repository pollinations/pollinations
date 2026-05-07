import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:xai:ops");
const logError = debug("pollinations:xai:error");

const XAI_GENERATE_URL = "https://api.x.ai/v1/images/generations";
const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";

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
 *
 * When `safeParams.image` contains a reference image URL, the request is
 * routed to /v1/images/edits for image-to-image generation. xAI's edits
 * endpoint requires application/json (NOT multipart/form-data — explicitly
 * called out in xAI's docs as a divergence from the OpenAI SDK). The
 * `image` field is a single ImageUrl object: `{url, detail}`, not an array
 * — verified empirically against the live endpoint (array form returns
 * 422). Only the first reference image is forwarded; additional entries
 * in `safeParams.image` are ignored.
 */
export async function callXaiImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    modelId: string = "grok-imagine-image",
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("XAI_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "XAI_API_KEY environment variable is required",
            500,
        );
    }

    const referenceImage = safeParams.image?.[0];
    const isEditMode = !!referenceImage;
    const endpoint = isEditMode ? XAI_EDITS_URL : XAI_GENERATE_URL;

    logOps(
        `Calling xAI image API (${modelId}, ${isEditMode ? "edit" : "generate"} mode) with prompt:`,
        prompt,
    );
    progress.updateBar(
        requestId,
        35,
        "Processing",
        isEditMode
            ? "Editing with Grok Imagine..."
            : "Generating with Grok Imagine...",
    );

    const requestBody: Record<string, unknown> = {
        model: modelId,
        prompt,
        n: 1,
        response_format: "url",
    };

    if (isEditMode && referenceImage) {
        requestBody.image = { url: referenceImage, detail: "auto" };
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
        throw new HttpError(
            "xAI returned no image URL",
            500,
            undefined,
            endpoint,
        );
    }

    logOps("Downloading result from URL:", result.url);
    progress.updateBar(requestId, 70, "Processing", "Downloading result...");

    const imageResponse = await fetchUpstream(result.url, {
        errorLabel: "Failed to download xAI result",
    });
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
