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

    // Edits bill input megapixels too, so read each reference's size while
    // inlining it (Fal also fetches redirect-free data URIs most reliably).
    let inputMegapixels = 0;
    const imageUrls = await Promise.all(
        images.map(async (image) => {
            const { buffer, mimeType } = await downloadUserImage(image);
            const dimensions = readImageDimensions(buffer, mimeType);
            if (dimensions) {
                inputMegapixels +=
                    (dimensions.width * dimensions.height) / 1_000_000;
            }
            return `data:${mimeType};base64,${buffer.toString("base64")}`;
        }),
    );
    const isEdit = imageUrls.length > 0;
    const upstreamUrl = isEdit
        ? QWEN_IMAGE_21_EDIT_URL
        : QWEN_IMAGE_21_GENERATE_URL;
    const width = roundToMultipleOf32(safeParams.width);
    const height = roundToMultipleOf32(safeParams.height);
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
            usage: {
                ...(isEdit ? { promptImageTokens: inputMegapixels } : {}),
                completionImageTokens: (width * height) / 1_000_000,
            },
        },
    };
}
