import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:qwen-image-3:ops");

const QWEN_IMAGE_3_URL = "https://fal.run/alibaba/qwen-image-3/text-to-image";

const FAL_IMAGE_SIZES = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
} as const;

type FalImageSize =
    | (typeof FAL_IMAGE_SIZES)[keyof typeof FAL_IMAGE_SIZES]
    | { width: number; height: number };

interface FalQwenImage3Response {
    images?: Array<{ url?: string }>;
    seed?: number;
}

function resolveImageSize(safeParams: ImageParams): FalImageSize {
    if (safeParams.dimensionsExplicit || !safeParams.aspectRatio) {
        return { width: safeParams.width, height: safeParams.height };
    }

    if (safeParams.aspectRatio === "adaptive") {
        return { width: safeParams.width, height: safeParams.height };
    }

    if (safeParams.aspectRatio in FAL_IMAGE_SIZES) {
        return FAL_IMAGE_SIZES[
            safeParams.aspectRatio as keyof typeof FAL_IMAGE_SIZES
        ];
    }
    throw new HttpError(
        `Aspect ratio ${safeParams.aspectRatio} is not supported by qwen-image-3`,
        400,
    );
}

export async function callQwenImage3API(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw new HttpError("FAL_KEY environment variable is required", 500);
    }

    if (safeParams.image.length > 0) {
        throw new HttpError(
            "Reference images are not supported by qwen-image-3",
            400,
        );
    }

    const requestBody = {
        prompt,
        image_size: resolveImageSize(safeParams),
        enable_prompt_expansion: false,
        enable_safety_checker: true,
        num_images: 1,
        output_format: "png",
        seed: safeParams.seed,
    };

    logOps("Calling fal text-to-image endpoint", {
        ...requestBody,
        prompt: prompt.slice(0, 80),
    });

    const response = await fetchUpstream(QWEN_IMAGE_3_URL, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "Qwen Image 3 generation failed",
    });
    const data = (await response.json()) as FalQwenImage3Response;
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
        throw new HttpError(
            "Qwen Image 3 returned no image URL",
            500,
            undefined,
            QWEN_IMAGE_3_URL,
        );
    }

    const imageResponse = await fetchUpstream(imageUrl, {
        errorLabel: "Failed to download Qwen Image 3 result",
    });
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "qwen-image-3",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
