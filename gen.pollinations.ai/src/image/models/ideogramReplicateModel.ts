/**
 * Ideogram 4.0 (turbo / balanced / quality) image generation via Replicate.
 *
 * Replicate models (all three share an identical input schema):
 *   - ideogram-v4-turbo    → ideogram-ai/ideogram-v4-turbo    ($0.03/img)
 *   - ideogram-v4-balanced → ideogram-ai/ideogram-v4-balanced ($0.06/img)
 *   - ideogram-v4-quality  → ideogram-ai/ideogram-v4-quality  ($0.10/img)
 *
 * Schema verified live against the Replicate model API:
 *   prompt: string, json_prompt: string, resolution: <WxH enum>,
 *   enable_copyright_detection: bool (default false).
 * Output is a SINGLE image-URL string (not an array). There is no `seed` and
 * no `image` input → these are text-to-image only. `resolution` is an explicit
 * WxH preset enum, so we map the caller's aspectRatio / dimensions to the
 * closest preset by log-space ratio distance.
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:ideogram:ops");
const logError = debug("pollinations:ideogram:error");

// Supported output resolutions, verified live against the Replicate schema.
// Identical across all three v4 variants. Each entry pairs the preset with its
// numeric width/height so we can pick the closest match to the request.
const IDEOGRAM_RESOLUTIONS = [
    "2048x2048",
    "1440x2880",
    "2880x1440",
    "1664x2496",
    "2496x1664",
    "1792x2240",
    "2240x1792",
    "1440x2560",
    "2560x1440",
    "1600x2560",
    "2560x1600",
    "1728x2304",
    "2304x1728",
    "1296x3168",
    "3168x1296",
    "1152x2944",
    "2944x1152",
    "1248x3328",
    "3328x1248",
    "1280x3072",
    "3072x1280",
] as const;
type IdeogramResolution = (typeof IDEOGRAM_RESOLUTIONS)[number];

interface IdeogramReplicateInput {
    prompt: string;
    resolution: IdeogramResolution;
}

interface IdeogramVariantConfig {
    replicateModel: string;
    displayName: string;
    /** Tracking label persisted to billing — matches the registry slug. */
    trackingLabel: string;
}

const IDEOGRAM_VARIANTS: Record<
    "ideogram-v4-turbo" | "ideogram-v4-balanced" | "ideogram-v4-quality",
    IdeogramVariantConfig
> = {
    "ideogram-v4-turbo": {
        replicateModel: "ideogram-ai/ideogram-v4-turbo",
        displayName: "Ideogram 4.0 Turbo",
        trackingLabel: "ideogram-v4-turbo",
    },
    "ideogram-v4-balanced": {
        replicateModel: "ideogram-ai/ideogram-v4-balanced",
        displayName: "Ideogram 4.0 Balanced",
        trackingLabel: "ideogram-v4-balanced",
    },
    "ideogram-v4-quality": {
        replicateModel: "ideogram-ai/ideogram-v4-quality",
        displayName: "Ideogram 4.0 Quality",
        trackingLabel: "ideogram-v4-quality",
    },
};

// Aspect-ratio enum entries map to a target W:H; "adaptive" has no image to
// match here, so it falls through to the dimension-derived ratio (the default
// 2048×2048 → 1:1 when the caller passed nothing).
const ASPECT_RATIO_DIMS: Record<string, [number, number]> = {
    "16:9": [16, 9],
    "9:16": [9, 16],
    "4:3": [4, 3],
    "3:4": [3, 4],
    "1:1": [1, 1],
    "21:9": [21, 9],
    "9:21": [9, 21],
};

/**
 * Pick the resolution preset whose aspect ratio is closest to the request, by
 * log-space distance (symmetric for landscape/portrait). Explicit aspectRatio
 * wins; otherwise width/height (always populated via defaultSideLength) decides.
 */
function resolveResolution(safeParams: ImageParams): IdeogramResolution {
    const ar = safeParams.aspectRatio;
    const [w, h] =
        ar && ar !== "adaptive" && ASPECT_RATIO_DIMS[ar]
            ? ASPECT_RATIO_DIMS[ar]
            : [safeParams.width || 1, safeParams.height || 1];

    const target = Math.log(w / h);
    let best: IdeogramResolution = IDEOGRAM_RESOLUTIONS[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const res of IDEOGRAM_RESOLUTIONS) {
        const [rw, rh] = res.split("x").map(Number);
        const dist = Math.abs(Math.log(rw / rh) - target);
        if (dist < bestDist) {
            bestDist = dist;
            best = res;
        }
    }
    return best;
}

async function callIdeogramReplicateAPI(
    variantKey: keyof typeof IDEOGRAM_VARIANTS,
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const variant = IDEOGRAM_VARIANTS[variantKey];

    const input: IdeogramReplicateInput = {
        prompt,
        resolution: resolveResolution(safeParams),
    };

    logOps(`${variant.displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
    });

    let outputUrl: string;
    try {
        const result = await runReplicatePrediction<
            IdeogramReplicateInput,
            string
        >({
            model: variant.replicateModel,
            input,
        });
        outputUrl = result.output;
        logOps(`${variant.displayName} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
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

    if (!outputUrl) {
        throw new HttpError(`${variant.displayName} returned no image`, 500);
    }

    const imageResponse = await fetchUpstream(outputUrl, {
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
        // Ideogram applies its own content moderation upstream.
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: variant.trackingLabel,
            // Flat per-image pricing on Replicate; report 1 image token.
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/** Ideogram 4.0 Turbo via Replicate (ideogram-ai/ideogram-v4-turbo). */
export function callIdeogramTurboAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callIdeogramReplicateAPI("ideogram-v4-turbo", prompt, safeParams);
}

/** Ideogram 4.0 Balanced via Replicate (ideogram-ai/ideogram-v4-balanced). */
export function callIdeogramBalancedAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callIdeogramReplicateAPI("ideogram-v4-balanced", prompt, safeParams);
}

/** Ideogram 4.0 Quality via Replicate (ideogram-ai/ideogram-v4-quality). */
export function callIdeogramQualityAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callIdeogramReplicateAPI("ideogram-v4-quality", prompt, safeParams);
}
