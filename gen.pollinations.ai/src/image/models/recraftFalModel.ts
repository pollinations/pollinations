import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const RECRAFT_FLASH_FAL_ENDPOINT =
    "https://fal.run/recraft/v4.1/flash/text-to-image";
const RECRAFT_FLASH_FAL_TIMEOUT_MS = 120_000;
// fal presets for Recraft's native sizes (16:9 returns 1344×768, the same
// image OpenRouter returns for that ratio).
const RECRAFT_FAL_SIZES: Record<string, string> = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
};
const RECRAFT_RATIOS = Object.keys(RECRAFT_FAL_SIZES);

type FalRecraftResponse = {
    images?: Array<{ url?: string; content_type?: string }>;
};

export async function callRecraftFlashFalAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "Recraft Fal route is not configured",
        });
    }

    const requested = safeParams.aspectRatio;
    const ratio =
        requested && requested !== "adaptive"
            ? requested
            : closestRatioLogSpace(
                  safeParams.width,
                  safeParams.height,
                  RECRAFT_RATIOS,
              );
    const imageSize = RECRAFT_FAL_SIZES[ratio];
    if (!imageSize) {
        throw UpstreamError.fromProvider(400, {
            message: `aspectRatio "${ratio}" is not supported by Recraft V4.1 Flash. Supported: ${RECRAFT_RATIOS.join(", ")}.`,
        });
    }

    const response = await fetchUpstream(RECRAFT_FLASH_FAL_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, image_size: imageSize }),
        signal: AbortSignal.timeout(RECRAFT_FLASH_FAL_TIMEOUT_MS),
        errorLabel: "Recraft Fal generation failed",
    });
    const result = (await response.json()) as FalRecraftResponse;
    const image = result.images?.[0];
    if (!image?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "Recraft Fal returned no image",
        });
    }
    // fal bills one unit per output image.
    const completionImageTokens = falBillableUnits(response);

    const imageResponse = await fetchUpstream(image.url, {
        signal: AbortSignal.timeout(RECRAFT_FLASH_FAL_TIMEOUT_MS),
        errorLabel: "Failed to download Recraft Fal output",
    });

    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        mimeType:
            image.content_type ||
            imageResponse.headers.get("content-type") ||
            undefined,
        trackingData: {
            actualModel: safeParams.model,
            usage: { completionImageTokens },
        },
    };
}

// The Pro Vector endpoint produces SVG, not a raster image.
const RECRAFT_PRO_VECTOR_FAL_ENDPOINT =
    "https://fal.run/fal-ai/recraft/v4.1/pro/text-to-vector";

export async function callRecraftProVectorFalAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "Recraft Pro Vector Fal route is not configured",
        });
    }
    if (safeParams.image.length) {
        throw UpstreamError.fromProvider(400, {
            message: "Recraft V4.1 Pro Vector Fal supports text-to-vector only",
        });
    }
    const requested = safeParams.aspectRatio;
    const ratio =
        requested && requested !== "adaptive"
            ? requested
            : closestRatioLogSpace(
                  safeParams.width,
                  safeParams.height,
                  RECRAFT_RATIOS,
              );
    const imageSize = RECRAFT_FAL_SIZES[ratio];
    if (!imageSize) {
        throw UpstreamError.fromProvider(400, {
            message: `aspectRatio "${ratio}" is not supported by Recraft V4.1 Pro Vector. Supported: ${RECRAFT_RATIOS.join(", ")}.`,
        });
    }
    const response = await fetchUpstream(RECRAFT_PRO_VECTOR_FAL_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt,
            image_size: imageSize,
            enable_safety_checker: true,
        }),
        signal: AbortSignal.timeout(RECRAFT_FLASH_FAL_TIMEOUT_MS),
        errorLabel: "Recraft Pro Vector Fal generation failed",
    });
    const result = (await response.json()) as FalRecraftResponse;
    const image = result.images?.[0];
    if (!image?.url || image.content_type !== "image/svg+xml") {
        throw UpstreamError.fromProvider(502, {
            message: "Recraft Pro Vector Fal returned no SVG",
        });
    }
    const units = falBillableUnits(response);
    const output = await fetchUpstream(image.url, {
        signal: AbortSignal.timeout(RECRAFT_FLASH_FAL_TIMEOUT_MS),
        errorLabel: "Failed to download Recraft Pro Vector SVG",
    });
    return {
        buffer: Buffer.from(await output.arrayBuffer()),
        mimeType: "image/svg+xml",
        trackingData: {
            actualModel: safeParams.model,
            usage: { completionImageTokens: units },
        },
    };
}
