import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    downloadUserImage,
    readImageDimensions,
} from "../utils/imageDownload.ts";

const logOps = debug("pollinations:qwen-image-2.1:ops");

const QWEN_IMAGE_21_GENERATE_URL =
    "https://fal.run/alibaba/qwen-image-2.1/text-to-image";
const QWEN_IMAGE_21_EDIT_URL = "https://fal.run/alibaba/qwen-image-2.1/edit";
const QWEN_IMAGE_21_MAX_IMAGES = 10;

interface FalQwenImage21Response {
    images?: Array<{ url?: string }>;
}

// Fal rounds the requested size to multiples of 32 and bills the rounded
// output, so send the rounded size and meter the same pixels.
function roundToMultipleOf32(value: number): number {
    return Math.max(32, Math.round(value / 32) * 32);
}

// Matches the default 1024x1024 side length (models.ts IMAGE_DEFAULT_SIDE_LENGTHS)
// so the total output area stays constant regardless of aspect ratio.
const DEFAULT_OUTPUT_AREA = 1024 * 1024;

// safeParams.width/height default to a fixed square when the caller sends
// aspectRatio without explicit dimensions, so aspectRatio must be resolved
// into a size here — otherwise every non-explicit request renders square.
function resolveImageSize(safeParams: ImageParams): {
    width: number;
    height: number;
} {
    const ratio = safeParams.aspectRatio;
    if (safeParams.dimensionsExplicit || !ratio || ratio === "adaptive") {
        return {
            width: roundToMultipleOf32(safeParams.width),
            height: roundToMultipleOf32(safeParams.height),
        };
    }
    const [w, h] = ratio.split(":").map(Number);
    if (!w || !h) {
        return {
            width: roundToMultipleOf32(safeParams.width),
            height: roundToMultipleOf32(safeParams.height),
        };
    }
    const scale = Math.sqrt(DEFAULT_OUTPUT_AREA / (w * h));
    return {
        width: roundToMultipleOf32(w * scale),
        height: roundToMultipleOf32(h * scale),
    };
}

export async function callQwenImage21API(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const images = safeParams.image ?? [];
    if (images.length > QWEN_IMAGE_21_MAX_IMAGES) {
        throw UpstreamError.fromProvider(400, {
            message: `qwen-image-2.1 supports at most ${QWEN_IMAGE_21_MAX_IMAGES} reference images`,
        });
    }

    // Edits bill input pixels too, so read each reference's size while
    // inlining it (Fal also fetches redirect-free data URIs most reliably).
    // A reference whose dimensions can't be parsed is rejected outright,
    // rather than silently billed as 0 input pixels — fal still charges
    // for it, so forwarding it unmetered would undercharge the request.
    let inputPixels = 0;
    const imageUrls = await Promise.all(
        images.map(async (image) => {
            const { buffer, mimeType } = await downloadUserImage(image);
            const dimensions = readImageDimensions(buffer, mimeType);
            if (!dimensions) {
                throw UpstreamError.fromProvider(400, {
                    message:
                        "qwen-image-2.1 could not determine a reference image's pixel dimensions; provide a PNG, GIF, BMP, or WebP with a valid header",
                });
            }
            inputPixels += dimensions.width * dimensions.height;
            return `data:${mimeType};base64,${buffer.toString("base64")}`;
        }),
    );
    const isEdit = imageUrls.length > 0;
    const upstreamUrl = isEdit
        ? QWEN_IMAGE_21_EDIT_URL
        : QWEN_IMAGE_21_GENERATE_URL;
    const { width, height } = resolveImageSize(safeParams);
    const requestBody = {
        prompt,
        ...(isEdit ? { image_urls: imageUrls } : {}),
        image_size: { width, height },
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
        errorLabel: `Qwen Image 2.1 ${isEdit ? "edit" : "generation"} failed`,
    });
    const data = (await response.json()) as FalQwenImage21Response;
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
        throw UpstreamError.fromProvider(502, {
            message: "Qwen Image 2.1 returned no image URL",
            requestUrl: new URL(upstreamUrl),
        });
    }

    const imageResponse = await fetchUpstream(imageUrl, {
        errorLabel: "Failed to download Qwen Image 2.1 result",
    });

    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "qwen/qwen-image-2.1",
            // Whole pixels: usage columns are UInt32, and the registry rates
            // are per pixel so fal's fractional-megapixel bill is preserved.
            usage: {
                ...(isEdit ? { promptImageTokens: inputPixels } : {}),
                completionImageTokens: width * height,
            },
        },
    };
}
