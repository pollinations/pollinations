import { UpstreamError } from "@shared/error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    downloadUserImage,
    readImageDimensions,
    toDataUri,
} from "../utils/imageDownload.ts";

const logOps = debug("pollinations:fal-qwen-image:ops");

// Fal serves both Qwen generations with the same request and response shape.
// Qwen Image 3 bills per image; Qwen Image 2.1 bills per output and input pixel.
const FAL_QWEN_MODELS = {
    "qwen/qwen-image-3:fal": {
        label: "Qwen Image 3",
        endpoint: "alibaba/qwen-image-3",
        maxImages: 3,
        billPixels: false,
        promptExpansion: { enable_prompt_expansion: false },
        resolveSize: resolveQwenImage3Size,
    },
    "qwen/qwen-image-2.1": {
        label: "Qwen Image 2.1",
        endpoint: "alibaba/qwen-image-2.1",
        maxImages: 10,
        billPixels: true,
        promptExpansion: { prompt_expander: "none" },
        resolveSize: resolveQwenImageSize,
    },
} as const;

export type FalQwenModel = keyof typeof FAL_QWEN_MODELS;

// Fal rounds sizes to multiples of 32 and bills the rounded output.
const roundTo32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);

/**
 * Without explicit dimensions, width × height is the model's default area:
 * keep that area and apply the requested aspect ratio.
 */
export function resolveQwenImageSize(params: ImageParams): {
    width: number;
    height: number;
} {
    const ratio = params.aspectRatio;
    if (params.dimensionsExplicit || !ratio || ratio === "adaptive") {
        return {
            width: roundTo32(params.width),
            height: roundTo32(params.height),
        };
    }
    const [w, h] = ratio.split(":").map(Number);
    const scale = Math.sqrt((params.width * params.height) / (w * h));
    return { width: roundTo32(w * scale), height: roundTo32(h * scale) };
}

/**
 * Qwen Image 3 takes explicit sizes as given (DashScope accepts any W×H in
 * range and bills its 1K/2K tier on the requested area), between 512×512 and
 * 2048×2048 total pixels.
 */
export function resolveQwenImage3Size(params: ImageParams) {
    const size = params.dimensionsExplicit
        ? { width: params.width, height: params.height }
        : resolveQwenImageSize(params);
    const pixels = size.width * size.height;
    if (pixels < 512 * 512 || pixels > 2048 * 2048) {
        throw UpstreamError.fromProvider(400, {
            message:
                "qwen-image-3 output must contain between 512×512 and 2048×2048 total pixels",
        });
    }
    return size;
}

// Pixel-billed edits meter each reference, so an unreadable one is rejected
// rather than forwarded unbilled.
async function toMeteredDataUri(image: string) {
    const download = await downloadUserImage(image);
    const { buffer } = download;
    // Hosts often label images application/octet-stream; trust the bytes.
    const mimeType = detectImageMimeType(buffer) ?? download.mimeType;
    const dimensions = readImageDimensions(buffer, mimeType);
    if (!dimensions) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Could not read a reference image's pixel dimensions; provide a JPEG, PNG, GIF, BMP, or WebP with a valid header",
        });
    }
    return {
        uri: `data:${mimeType};base64,${buffer.toString("base64")}`,
        pixels: dimensions.width * dimensions.height,
    };
}

export async function callFalQwenImageAPI(
    prompt: string,
    safeParams: ImageParams,
    model: FalQwenModel,
): Promise<ImageGenerationResult> {
    const config = FAL_QWEN_MODELS[model];
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const images = safeParams.image ?? [];
    if (images.length > config.maxImages) {
        throw UpstreamError.fromProvider(400, {
            message: `${config.label} supports at most ${config.maxImages} reference images`,
        });
    }
    const size = config.resolveSize(safeParams);
    const references = await Promise.all(
        images.map(async (image) =>
            config.billPixels
                ? toMeteredDataUri(image)
                : { uri: await toDataUri(image), pixels: 1 },
        ),
    );
    const isEdit = references.length > 0;
    const upstreamUrl = `https://fal.run/${config.endpoint}/${isEdit ? "edit" : "text-to-image"}`;
    const requestBody = {
        prompt,
        ...(isEdit ? { image_urls: references.map((r) => r.uri) } : {}),
        image_size: size,
        ...config.promptExpansion,
        // Pollinations runs its own moderation.
        enable_safety_checker: false,
        output_format: "png",
        seed: safeParams.seed,
    };

    logOps(`Calling ${upstreamUrl}`, {
        ...requestBody,
        prompt: prompt.slice(0, 80),
        image_urls: isEdit ? `[${references.length} data uris]` : undefined,
    });

    const response = await fetchUpstream(upstreamUrl, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: `${config.label} ${isEdit ? "edit" : "generation"} failed`,
    });
    const data = (await response.json()) as {
        images?: Array<{ url?: string }>;
    };
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
        throw UpstreamError.fromProvider(502, {
            message: `${config.label} returned no image URL`,
            requestUrl: new URL(upstreamUrl),
        });
    }

    const imageResponse = await fetchUpstream(imageUrl, {
        errorLabel: `Failed to download ${config.label} result`,
    });

    // Per-pixel usage stays whole pixels: usage columns are UInt32.
    const inputTokens = references.reduce((sum, r) => sum + r.pixels, 0);
    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                ...(isEdit ? { promptImageTokens: inputTokens } : {}),
                completionImageTokens: config.billPixels
                    ? size.width * size.height
                    : 1,
            },
        },
    };
}
