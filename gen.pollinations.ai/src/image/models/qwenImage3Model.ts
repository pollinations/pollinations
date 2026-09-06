import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:qwen-image-3:ops");

const QWEN_IMAGE_3_GENERATE_URL =
    "https://fal.run/alibaba/qwen-image-3/text-to-image";
const QWEN_IMAGE_3_EDIT_URL = "https://fal.run/alibaba/qwen-image-3/edit";
const QWEN_IMAGE_3_MAX_IMAGES = 3;
const QWEN_IMAGE_3_MIN_PIXELS = 512 * 512;
const QWEN_IMAGE_3_MAX_PIXELS = 2048 * 2048;

const FAL_IMAGE_SIZES = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
    "21:9": { width: 1536, height: 658 },
    "9:21": { width: 658, height: 1536 },
} as const;

type FalImageSize =
    | (typeof FAL_IMAGE_SIZES)[keyof typeof FAL_IMAGE_SIZES]
    | { width: number; height: number };

interface FalQwenImage3Response {
    images?: Array<{ url?: string }>;
}

function resolveImageSize(safeParams: ImageParams): FalImageSize {
    if (safeParams.dimensionsExplicit || !safeParams.aspectRatio) {
        return { width: safeParams.width, height: safeParams.height };
    }
    if (safeParams.aspectRatio === "adaptive") {
        return { width: safeParams.width, height: safeParams.height };
    }
    const preset =
        FAL_IMAGE_SIZES[safeParams.aspectRatio as keyof typeof FAL_IMAGE_SIZES];
    if (preset) return preset;
    throw UpstreamError.fromProvider(400, {
        message: `Aspect ratio ${safeParams.aspectRatio} is not supported by qwen-image-3`,
    });
}

export async function callQwenImage3API(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const outputPixels = safeParams.width * safeParams.height;
    if (
        safeParams.width <= 0 ||
        safeParams.height <= 0 ||
        outputPixels < QWEN_IMAGE_3_MIN_PIXELS ||
        outputPixels > QWEN_IMAGE_3_MAX_PIXELS
    ) {
        throw UpstreamError.fromProvider(400, {
            message:
                "qwen-image-3 output must contain between 512×512 and 2048×2048 total pixels",
        });
    }

    const images = safeParams.image ?? [];
    if (images.length > QWEN_IMAGE_3_MAX_IMAGES) {
        throw UpstreamError.fromProvider(400, {
            message: `qwen-image-3 supports at most ${QWEN_IMAGE_3_MAX_IMAGES} reference images`,
        });
    }
    const imageUrls = await Promise.all(images.map(toDataUri));
    const isEdit = imageUrls.length > 0;
    const upstreamUrl = isEdit
        ? QWEN_IMAGE_3_EDIT_URL
        : QWEN_IMAGE_3_GENERATE_URL;
    const requestBody = {
        prompt,
        ...(isEdit ? { image_urls: imageUrls } : {}),
        image_size: resolveImageSize(safeParams),
        enable_prompt_expansion: false,
        enable_safety_checker: true,
        num_images: 1,
        output_format: "png",
        seed: safeParams.seed,
    };

    logOps(`Calling fal ${isEdit ? "edit" : "text-to-image"} endpoint`, {
        ...requestBody,
        prompt: prompt.slice(0, 80),
        image_urls: isEdit ? `[${imageUrls.length} data uris]` : undefined,
    });

    const response = await fetchUpstream(upstreamUrl, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: `Qwen Image 3 ${isEdit ? "edit" : "generation"} failed`,
    });
    const data = (await response.json()) as FalQwenImage3Response;
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
        throw UpstreamError.fromProvider(502, {
            message: "Qwen Image 3 returned no image URL",
            requestUrl: new URL(upstreamUrl),
        });
    }

    const imageResponse = await fetchUpstream(imageUrl, {
        errorLabel: "Failed to download Qwen Image 3 result",
    });

    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "qwen-image-3",
            usage: {
                ...(isEdit ? { promptImageTokens: imageUrls.length } : {}),
                completionImageTokens: 1,
            },
        },
    };
}
