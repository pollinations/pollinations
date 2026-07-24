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

interface OpenRouterImageResponse {
    data?: Array<{ b64_json?: string }>;
    usage?: { cost?: number | null };
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
