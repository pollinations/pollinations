/**
 * ByteDance Seedream 4.0 and 4.5 Pro image generation via Replicate.
 *
 * Completes the BytePlus → Replicate migration started in PR #11073, which
 * moved seedream5 + seedance variants but left these legacy variants on the
 * BytePlus ARK endpoint. Replicate models:
 *   - seedream     → bytedance/seedream-4   ($0.03/img)
 *   - seedream-pro → bytedance/seedream-4.5 ($0.06/img)
 *
 * Schemas mirror seedream-5-lite (shared `aspect_ratio` enum, `image_input`
 * array, `sequential_image_generation`); the only meaningful difference is
 * the `size` enum, which is per-model.
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedream-legacy:ops");
const logError = debug("pollinations:seedream-legacy:error");

const SEEDREAM_ASPECT_RATIOS = [
    "match_input_image",
    "1:1",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
    "3:2",
    "2:3",
    "21:9",
] as const;
type SeedreamAspectRatio = (typeof SEEDREAM_ASPECT_RATIOS)[number];

type Seedream4Size = "1K" | "2K" | "4K";
type Seedream45Size = "2K" | "4K";

interface SeedreamReplicateInput {
    prompt: string;
    size: Seedream4Size | Seedream45Size;
    aspect_ratio: SeedreamAspectRatio;
    image_input: string[];
    sequential_image_generation: "disabled";
    max_images: 1;
    seed?: number;
}

interface SeedreamVariantConfig {
    replicateModel: string;
    displayName: string;
    /** Tracking label persisted to billing — matches pre-migration tracking. */
    trackingLabel: string;
    /** Cap on reference images accepted by the upstream model. */
    maxReferenceImages: number;
    /** Pick the size bucket for a given longer-side pixel value. */
    resolveSize(longerSide: number): Seedream4Size | Seedream45Size;
}

const SEEDREAM_VARIANTS: Record<
    "seedream" | "seedream-pro",
    SeedreamVariantConfig
> = {
    seedream: {
        replicateModel: "bytedance/seedream-4",
        displayName: "Seedream 4.0",
        trackingLabel: "seedream",
        maxReferenceImages: 10,
        resolveSize(longerSide) {
            if (longerSide > 2048) return "4K";
            if (longerSide > 1024) return "2K";
            return "1K";
        },
    },
    "seedream-pro": {
        replicateModel: "bytedance/seedream-4.5",
        displayName: "Seedream 4.5 Pro",
        trackingLabel: "seedream-pro",
        maxReferenceImages: 14,
        resolveSize(longerSide) {
            return longerSide > 2048 ? "4K" : "2K";
        },
    },
};

/**
 * Map our ImageParams.aspectRatio (16:9, 4:3, 1:1, 3:4, 9:16, 21:9, 9:21,
 * adaptive) to Replicate's enum. "9:21" has no direct match — return 400 so
 * callers see the mismatch instead of silently rounding. "adaptive" maps to
 * "match_input_image" so users get what they intend when passing an image.
 */
function resolveAspectRatio(
    requested: ImageParams["aspectRatio"] | undefined,
    hasImage: boolean,
    displayName: string,
): SeedreamAspectRatio {
    if (!requested) return hasImage ? "match_input_image" : "1:1";
    if (requested === "adaptive") return "match_input_image";
    if (requested === "9:21") {
        throw new HttpError(
            `aspectRatio "9:21" is not supported by ${displayName}. Supported: ${SEEDREAM_ASPECT_RATIOS.join(", ")}.`,
            400,
        );
    }
    if ((SEEDREAM_ASPECT_RATIOS as readonly string[]).includes(requested)) {
        return requested as SeedreamAspectRatio;
    }
    throw new HttpError(
        `aspectRatio "${requested}" is not supported by ${displayName}. Supported: ${SEEDREAM_ASPECT_RATIOS.join(", ")}.`,
        400,
    );
}

async function callSeedreamReplicateAPI(
    variantKey: "seedream" | "seedream-pro",
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    const variant = SEEDREAM_VARIANTS[variantKey];

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Starting ${variant.displayName} generation...`,
    );

    const images = safeParams.image ?? [];
    if (images.length > variant.maxReferenceImages) {
        throw new HttpError(
            `${variant.displayName} supports at most ${variant.maxReferenceImages} reference images (received ${images.length}).`,
            400,
        );
    }

    // Replicate's URL fetcher chokes on query strings and missing extensions
    // (same issue seen in seedance-2.0 / seedream5). Download here and pass
    // data URIs.
    const toDataUri = async (url: string): Promise<string> => {
        const { buffer, mimeType } = await downloadUserImage(url);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
    };
    const imageInput =
        images.length > 0 ? await Promise.all(images.map(toDataUri)) : [];

    if (imageInput.length > 0) {
        progress.updateBar(
            requestId,
            45,
            "Processing",
            `Processed ${imageInput.length} reference image(s)`,
        );
    }

    const longerSide = Math.max(safeParams.width ?? 0, safeParams.height ?? 0);
    const input: SeedreamReplicateInput = {
        prompt,
        size: variant.resolveSize(longerSide),
        aspect_ratio: resolveAspectRatio(
            safeParams.aspectRatio,
            imageInput.length > 0,
            variant.displayName,
        ),
        image_input: imageInput,
        sequential_image_generation: "disabled",
        max_images: 1,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }

    logOps(`${variant.displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image_input: imageInput.length
            ? `[${imageInput.length} data uris]`
            : [],
    });

    progress.updateBar(
        requestId,
        55,
        "Processing",
        "Submitting to Replicate...",
    );

    let outputUrls: string[];
    try {
        const result = await runReplicatePrediction<
            SeedreamReplicateInput,
            string[]
        >({
            model: variant.replicateModel,
            input,
        });
        outputUrls = Array.isArray(result.output) ? result.output : [];
        logOps(`${variant.displayName} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            output_count: outputUrls.length,
        });
    } catch (err) {
        logError(`${variant.displayName} prediction call failed:`, err);
        if (err instanceof ReplicateError) {
            throw new HttpError(
                `${variant.displayName} generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }

    if (outputUrls.length === 0) {
        throw new HttpError(`${variant.displayName} returned no images`, 500);
    }

    progress.updateBar(
        requestId,
        80,
        "Processing",
        "Downloading generated image...",
    );
    const imageResponse = await fetchUpstream(outputUrls[0], {
        errorLabel: `Failed to download ${variant.displayName} output image`,
    });
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(
        `${variant.displayName} image downloaded:`,
        (imageBuffer.length / 1024).toFixed(1),
        "KB",
    );

    progress.updateBar(
        requestId,
        95,
        "Success",
        `${variant.displayName} generation completed`,
    );

    return {
        buffer: imageBuffer,
        // Seedream has built-in content filtering — preserve the existing
        // contract from the BytePlus path.
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: variant.trackingLabel,
            // Flat per-image pricing on Replicate; report 1 image token to
            // match the prior BytePlus billing convention.
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/** Seedream 4.0 via Replicate (bytedance/seedream-4). */
export function callSeedreamAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    return callSeedreamReplicateAPI(
        "seedream",
        prompt,
        safeParams,
        progress,
        requestId,
    );
}

/** Seedream 4.5 Pro via Replicate (bytedance/seedream-4.5). */
export function callSeedreamProAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    return callSeedreamReplicateAPI(
        "seedream-pro",
        prompt,
        safeParams,
        progress,
        requestId,
    );
}
