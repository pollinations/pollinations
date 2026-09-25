import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:fal-qwen-image:ops");

// Fal serves both Qwen generations with the same request and response shape.
// Qwen Image 3 bills per image and per reference image.
// Qwen Image 2.1 bills megapixels of 2^20 px: output rounded up to whole
// megapixels, each reference as half a megapixel whatever its size (measured
// against fal's usage API, 2026-09-25). Usage counts millionths of a billed
// megapixel, so the registry's perMillion(x) rates equal fal's $x per megapixel.
const MEGAPIXEL = 1024 * 1024;

const FAL_QWEN_MODELS = {
    "qwen/qwen-image-3:fal": {
        label: "Qwen Image 3",
        endpoint: "alibaba/qwen-image-3",
        maxImages: 3,
        promptExpansion: { enable_prompt_expansion: false },
        editOptions: {},
        resolveSize: resolveQwenImage3Size,
        usage: (_size: FalImageSize, references: number) => ({
            promptImageTokens: references,
            completionImageTokens: 1,
        }),
    },
    "qwen/qwen-image-2.1": {
        label: "Qwen Image 2.1",
        endpoint: "alibaba/qwen-image-2.1",
        maxImages: 10,
        promptExpansion: { prompt_expander: "none" },
        // Fal defaults to no guidance, which leaves edits noisy and
        // oversharpened. Guidance doubles the edit price (measured 2026-09-25).
        editOptions: { guidance_scale: 4 },
        resolveSize: resolveQwenImageSize,
        usage: (size: FalImageSize, references: number) => ({
            promptImageTokens: references * 500_000,
            completionImageTokens:
                Math.ceil((size.width * size.height) / MEGAPIXEL) * 1_000_000,
        }),
    },
} as const;

type FalImageSize = { width: number; height: number };

export type FalQwenModel = keyof typeof FAL_QWEN_MODELS;

// Fal rounds sizes to multiples of 32 and bills the rounded output.
const roundTo32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);

/**
 * Without explicit dimensions, width × height is the model's default area:
 * keep that area and apply the requested aspect ratio.
 */
export function resolveQwenImageSize(params: ImageParams): FalImageSize {
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
    const references = await Promise.all(images.map(toDataUri));
    const isEdit = references.length > 0;
    const upstreamUrl = `https://fal.run/${config.endpoint}/${isEdit ? "edit" : "text-to-image"}`;
    const requestBody = {
        prompt,
        ...(isEdit ? { image_urls: references, ...config.editOptions } : {}),
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

    const { promptImageTokens, completionImageTokens } = config.usage(
        size,
        references.length,
    );
    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                ...(isEdit ? { promptImageTokens } : {}),
                completionImageTokens,
            },
        },
    };
}
