import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestAspectRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:openrouter-image:ops");

const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images";
const GROK_IMAGINE_QUALITY_MODEL = "x-ai/grok-imagine-image-quality";
const RECRAFT_VECTOR_MODEL = "recraft/recraft-v4.1-vector";
const SVG_MEDIA_TYPE = "image/svg+xml";

interface OpenRouterImageResponse {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number | null;
    };
}

export async function callOpenRouterGrokImagineProAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "OPENROUTER_API_KEY environment variable is required",
            500,
        );
    }

    const referenceImage = safeParams.image?.[0];
    const requestBody: Record<string, unknown> = {
        model: GROK_IMAGINE_QUALITY_MODEL,
        prompt,
        n: 1,
        resolution: "1K",
    };

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    if (referenceImage) {
        requestBody.input_references = [
            {
                type: "image_url",
                image_url: { url: referenceImage },
            },
        ];
    }

    const response = await fetchUpstream(OPENROUTER_IMAGE_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "OpenRouter image generation request failed",
    });
    const data = (await response.json()) as OpenRouterImageResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    if (!encodedImage) {
        throw new HttpError(
            "OpenRouter image API returned no image",
            502,
            data,
            OPENROUTER_IMAGE_URL,
        );
    }

    logOps("Grok Imagine Pro generation complete", {
        edit: Boolean(referenceImage),
        providerCost: data.usage?.cost,
    });

    return {
        buffer: base64ToBuffer(encodedImage),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "grok-imagine-pro",
            usage: {
                ...(referenceImage ? { promptImageTokens: 1 } : {}),
                completionImageTokens: 1,
            },
        },
    };
}

export async function callOpenRouterRecraftVectorAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "OPENROUTER_API_KEY environment variable is required",
            500,
        );
    }

    const referenceImage = safeParams.image?.[0];
    const requestBody: Record<string, unknown> = {
        model: RECRAFT_VECTOR_MODEL,
        prompt,
        n: 1,
        provider: {
            only: ["recraft"],
            allow_fallbacks: false,
        },
    };

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    if (referenceImage) {
        requestBody.input_references = [
            {
                type: "image_url",
                image_url: { url: referenceImage },
            },
        ];
    }

    let response: Response;
    try {
        response = await fetchUpstream(OPENROUTER_IMAGE_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            errorLabel: "OpenRouter vector generation request failed",
        });
    } catch (error) {
        if (error instanceof HttpError && error.status === 429) {
            throw new UpstreamError(429, {
                message:
                    "Recraft vector generation is at capacity. Please retry shortly.",
                requestUrl: new URL(OPENROUTER_IMAGE_URL),
                upstreamStatus: 429,
                cause: error,
            });
        }
        throw error;
    }
    const data = (await response.json()) as OpenRouterImageResponse;
    const generatedImage = data.data?.[0];
    if (!generatedImage?.b64_json) {
        throw new HttpError(
            "OpenRouter image API returned no vector",
            502,
            data,
            OPENROUTER_IMAGE_URL,
        );
    }
    if (generatedImage.media_type !== SVG_MEDIA_TYPE) {
        throw new HttpError(
            `OpenRouter image API returned unsupported media type: ${generatedImage.media_type || "missing"}`,
            502,
            data,
            OPENROUTER_IMAGE_URL,
        );
    }

    logOps("Recraft vector generation complete", {
        edit: Boolean(referenceImage),
        providerUsage: data.usage,
    });

    return {
        buffer: base64ToBuffer(generatedImage.b64_json),
        mimeType: SVG_MEDIA_TYPE,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "recraft-v4.1-vector",
            // OpenRouter bills this endpoint a fixed $0.08 per output image.
            usage: { completionImageTokens: 1 },
        },
    };
}
