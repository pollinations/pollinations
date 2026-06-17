/**
 * ByteDance Seedream 4.0, 4.5 Pro, and 5.0 Lite image generation via Replicate.
 *
 * Completes the BytePlus → Replicate migration started in PR #11073, which
 * moved seedream5 + seedance variants but left these legacy variants on the
 * BytePlus ARK endpoint. Replicate models:
 *   - seedream     → bytedance/seedream-4      ($0.03/img)
 *   - seedream-pro → bytedance/seedream-4.5    ($0.06/img)
 *   - seedream5    → bytedance/seedream-5-lite (flat per-image)
 *
 * Schemas share the `aspect_ratio` enum, `image_input` array, and
 * `sequential_image_generation`; they differ in the per-model `size` enum and
 * whether they accept `output_format` (only seedream5 does) or a `custom` size
 * mode (only seedream 4.0 does).
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
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

// Numeric presets only — "match_input_image" can't be derived from dimensions.
const SEEDREAM_NUMERIC_RATIOS = SEEDREAM_ASPECT_RATIOS.filter(
    (r) => r !== "match_input_image",
) as readonly Exclude<SeedreamAspectRatio, "match_input_image">[];

type Seedream4Size = "1K" | "2K" | "4K";
type Seedream45Size = "2K" | "4K";
type Seedream5Size = "2K" | "3K";

// seedream-4 (4.0) supports two payload shapes; 4.5 and 5.0 do NOT support
// custom.
//   - preset: size: "1K"|"2K"|"4K"|"3K" + aspect_ratio
//   - custom: size: "custom" + width + height (both 1024-4096)
// Replicate's schema explicitly says aspect_ratio is ignored when
// size === "custom", so they're mutually exclusive at the type level.
// `output_format` is only sent for seedream5 — 4.5's schema strict-rejects
// unknown fields, so it must stay opt-in.
type SeedreamPresetInput = {
    prompt: string;
    size: Seedream4Size | Seedream45Size | Seedream5Size;
    aspect_ratio: SeedreamAspectRatio;
    image_input: string[];
    output_format?: "png" | "jpeg";
    sequential_image_generation: "disabled";
    max_images: 1;
};
type SeedreamCustomInput = {
    prompt: string;
    size: "custom";
    width: number;
    height: number;
    image_input: string[];
    sequential_image_generation: "disabled";
    max_images: 1;
};
type SeedreamReplicateInput = SeedreamPresetInput | SeedreamCustomInput;

// Verified against the live bytedance/seedream-4 schema.
const SEEDREAM4_CUSTOM_MIN = 1024;
const SEEDREAM4_CUSTOM_MAX = 4096;

interface SeedreamVariantConfig {
    replicateModel: string;
    displayName: string;
    /** Tracking label persisted to billing — matches pre-migration tracking. */
    trackingLabel: string;
    /** Cap on reference images accepted by the upstream model. */
    maxReferenceImages: number;
    /** Pick the size bucket for a given longer-side pixel value. */
    resolveSize(
        longerSide: number,
    ): Seedream4Size | Seedream45Size | Seedream5Size;
    /** Whether the upstream accepts size:"custom" + width/height. Only 4.0. */
    supportsCustom: boolean;
    /**
     * Opt-in `output_format` field — only seedream5 accepts it. 4.5's schema
     * strict-rejects unknown fields, so leave it unset for the others.
     */
    outputFormat?: "png" | "jpeg";
}

const SEEDREAM_VARIANTS: Record<
    "seedream" | "seedream-pro" | "seedream5",
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
        supportsCustom: true,
    },
    "seedream-pro": {
        replicateModel: "bytedance/seedream-4.5",
        displayName: "Seedream 4.5 Pro",
        trackingLabel: "seedream-pro",
        maxReferenceImages: 14,
        resolveSize(longerSide) {
            return longerSide > 2048 ? "4K" : "2K";
        },
        // 4.5's size enum is ["2K", "4K"] only — verified against live schema.
        supportsCustom: false,
    },
    seedream5: {
        replicateModel: "bytedance/seedream-5-lite",
        displayName: "Seedream 5.0 Lite",
        trackingLabel: "seedream5",
        maxReferenceImages: 14,
        // 5.0's size enum is ["2K", "3K"] only — no pixel dimensions, no custom.
        resolveSize(longerSide) {
            return longerSide > 2048 ? "3K" : "2K";
        },
        supportsCustom: false,
        outputFormat: "png",
    },
};

/**
 * Map our ImageParams.aspectRatio (16:9, 4:3, 1:1, 3:4, 9:16, 21:9, 9:21,
 * adaptive) to Replicate's enum. "9:21" has no direct match — return 400 so
 * callers see the mismatch instead of silently rounding. "adaptive" maps to
 * "match_input_image" so users get what they intend when passing an image.
 *
 * When no aspectRatio is provided we fall back to width/height (via the OpenAI
 * `size: "1792x1024"` shape this is the only signal of intent) — without that
 * derivation, 1792×1024 / 1920×1080 would silently default to "1:1".
 */
function resolveAspectRatio(
    safeParams: ImageParams,
    hasImage: boolean,
    displayName: string,
): SeedreamAspectRatio {
    const requested = safeParams.aspectRatio;
    if (!requested) {
        if (hasImage) return "match_input_image";
        if (safeParams.width && safeParams.height) {
            return closestRatioLogSpace(
                safeParams.width,
                safeParams.height,
                SEEDREAM_NUMERIC_RATIOS,
            );
        }
        return "1:1";
    }
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

function buildPresetInput(
    prompt: string,
    safeParams: ImageParams,
    imageInput: string[],
    variant: SeedreamVariantConfig,
): SeedreamPresetInput {
    const longerSide = Math.max(safeParams.width ?? 0, safeParams.height ?? 0);
    return {
        prompt,
        size: variant.resolveSize(longerSide),
        aspect_ratio: resolveAspectRatio(
            safeParams,
            imageInput.length > 0,
            variant.displayName,
        ),
        image_input: imageInput,
        // Only seedream5 carries output_format — spread it conditionally so
        // 4.5's strict schema never sees an unknown field.
        ...(variant.outputFormat
            ? { output_format: variant.outputFormat }
            : {}),
        sequential_image_generation: "disabled",
        max_images: 1,
    };
}

function buildCustomInput(
    prompt: string,
    safeParams: ImageParams,
    imageInput: string[],
    variant: SeedreamVariantConfig,
): SeedreamCustomInput {
    const { width, height } = safeParams;
    if (
        width < SEEDREAM4_CUSTOM_MIN ||
        width > SEEDREAM4_CUSTOM_MAX ||
        height < SEEDREAM4_CUSTOM_MIN ||
        height > SEEDREAM4_CUSTOM_MAX
    ) {
        throw new HttpError(
            `${variant.displayName} custom dimensions must be between ${SEEDREAM4_CUSTOM_MIN}-${SEEDREAM4_CUSTOM_MAX}px on each side (received ${width}×${height}).`,
            400,
        );
    }
    return {
        prompt,
        size: "custom",
        width,
        height,
        image_input: imageInput,
        sequential_image_generation: "disabled",
        max_images: 1,
    };
}

async function callSeedreamReplicateAPI(
    variantKey: "seedream" | "seedream-pro" | "seedream5",
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const variant = SEEDREAM_VARIANTS[variantKey];

    const images = safeParams.image ?? [];
    if (images.length > variant.maxReferenceImages) {
        throw new HttpError(
            `${variant.displayName} supports at most ${variant.maxReferenceImages} reference images (received ${images.length}).`,
            400,
        );
    }

    const imageInput =
        images.length > 0 ? await Promise.all(images.map(toDataUri)) : [];

    // Replicate's bytedance/seedream-4 and 4.5 schemas don't accept a `seed`
    // field — 4.5 strict-rejects unknown fields, 4 silently drops them.
    //
    // seedream-4 (4.0) supports a "custom" size mode that takes raw width and
    // height instead of a preset+aspect_ratio pair. When the caller actually
    // passed dimensions (OpenAI `size:"1792x1024"`, GET `?width=…&height=…`),
    // use that mode so we produce exact pixels instead of rounding to the
    // nearest preset. 4.5 has no custom mode, so it stays on the preset path.
    const input: SeedreamReplicateInput =
        variant.supportsCustom && safeParams.dimensionsExplicit
            ? buildCustomInput(prompt, safeParams, imageInput, variant)
            : buildPresetInput(prompt, safeParams, imageInput, variant);

    logOps(`${variant.displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image_input: imageInput.length
            ? `[${imageInput.length} data uris]`
            : [],
    });

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

    const imageResponse = await fetchUpstream(outputUrls[0], {
        errorLabel: `Failed to download ${variant.displayName} output image`,
    });
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(
        `${variant.displayName} image downloaded:`,
        (imageBuffer.length / 1024).toFixed(1),
        "KB",
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
): Promise<ImageGenerationResult> {
    return callSeedreamReplicateAPI("seedream", prompt, safeParams);
}

/** Seedream 4.5 Pro via Replicate (bytedance/seedream-4.5). */
export function callSeedreamProAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callSeedreamReplicateAPI("seedream-pro", prompt, safeParams);
}

/** Seedream 5.0 Lite via Replicate (bytedance/seedream-5-lite). */
export function callSeedream5API(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callSeedreamReplicateAPI("seedream5", prompt, safeParams);
}
