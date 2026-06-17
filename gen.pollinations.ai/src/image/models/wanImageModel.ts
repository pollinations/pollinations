/**
 * Alibaba Wan 2.7 Image generation via Replicate.
 *
 * Moved off Alibaba DashScope (provider consolidation onto Replicate, which we
 * already use for Seedream/Seedance). Replicate models:
 *   - wan-image     → wan-video/wan-2.7-image      ($0.03/img, up to 2K)
 *   - wan-image-pro → wan-video/wan-2.7-image-pro  ($0.03/img, 4K, thinking)
 *
 * Both accept an `images` array for editing and a `size` enum (named tier or
 * exact W*H). We resolve the requested aspect ratio to the nearest exact size
 * at the 2K tier (4K for pro text-to-image, where the upstream allows it).
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestByRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:wan-image:ops");
const logError = debug("pollinations:wan-image:error");

const WAN_IMAGE_MODEL = "wan-video/wan-2.7-image";
const WAN_IMAGE_PRO_MODEL = "wan-video/wan-2.7-image-pro";

// Exact size enums (verified against live schemas), keyed by aspect ratio. 2K
// covers wan-2.7-image and pro editing; 4K is pro text-to-image only.
const WAN_SIZES_2K = [
    { ratio: 1 / 1, size: "2048*2048" },
    { ratio: 16 / 9, size: "2048*1152" },
    { ratio: 9 / 16, size: "1152*2048" },
    { ratio: 4 / 3, size: "2048*1536" },
    { ratio: 3 / 4, size: "1536*2048" },
] as const;
const WAN_SIZES_4K = [
    { ratio: 1 / 1, size: "4096*4096" },
    { ratio: 16 / 9, size: "4096*2304" },
    { ratio: 9 / 16, size: "2304*4096" },
    { ratio: 4 / 3, size: "4096*3072" },
    { ratio: 3 / 4, size: "3072*4096" },
] as const;

// Reference-image cap — matches the prior DashScope path and registry
// maxReferenceImages: 9.
const WAN_MAX_IMAGES = 9;

// ImageParams.aspectRatio → width/height pair, so an explicit aspect ratio wins
// over (possibly defaulted) width/height when picking the closest size.
const ASPECT_RATIO_WH: Record<string, [number, number]> = {
    "1:1": [1, 1],
    "16:9": [16, 9],
    "9:16": [9, 16],
    "4:3": [4, 3],
    "3:4": [3, 4],
    "21:9": [21, 9],
    "9:21": [9, 21],
};

function resolveSize(
    safeParams: ImageParams,
    sizes: readonly { ratio: number; size: string }[],
): string {
    const requested = safeParams.aspectRatio;
    const [w, h] =
        requested && requested !== "adaptive" && ASPECT_RATIO_WH[requested]
            ? ASPECT_RATIO_WH[requested]
            : [safeParams.width || 1024, safeParams.height || 1024];
    return closestByRatio(w, h, sizes).size;
}

/**
 * Generates an image using Alibaba Wan 2.7 Image via Replicate. Routes
 * pro/standard by the isPro flag; supplies reference images for editing.
 */
export async function callWanImageAPI(
    prompt: string,
    safeParams: ImageParams,
    isPro = false,
): Promise<ImageGenerationResult> {
    const images = safeParams.image ?? [];
    const hasImage = images.length > 0;
    const model = isPro ? WAN_IMAGE_PRO_MODEL : WAN_IMAGE_MODEL;
    const modelLabel = isPro ? "Wan 2.7 Image Pro" : "Wan 2.7 Image";
    const trackingLabel = isPro ? "wan-image-pro" : "wan-image";

    // 4K is available only for pro text-to-image; pro editing and the standard
    // model cap at 2K (matches the prior DashScope pixel limits).
    const size = resolveSize(
        safeParams,
        isPro && !hasImage ? WAN_SIZES_4K : WAN_SIZES_2K,
    );

    const imageInput = hasImage
        ? await Promise.all(images.slice(0, WAN_MAX_IMAGES).map(toDataUri))
        : [];

    const input: Record<string, unknown> = {
        prompt,
        size,
        images: imageInput,
        num_outputs: 1,
        // Thinking mode improves pro text-to-image quality; preserve the prior
        // DashScope behavior of enabling it only there.
        thinking_mode: isPro && !hasImage,
        ...(safeParams.seed !== undefined ? { seed: safeParams.seed } : {}),
    };

    logOps(`${modelLabel} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        images: hasImage ? `[${imageInput.length} data uris]` : [],
    });

    let outputUrls: string[];
    try {
        const result = await runReplicatePrediction<typeof input, string[]>({
            model,
            input,
        });
        outputUrls = Array.isArray(result.output) ? result.output : [];
        logOps(`${modelLabel} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            output_count: outputUrls.length,
        });
    } catch (err) {
        logError(`${modelLabel} prediction call failed:`, err);
        if (err instanceof ReplicateError) {
            throw new HttpError(
                `${modelLabel} generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }

    if (outputUrls.length === 0) {
        throw new HttpError(`${modelLabel} returned no images`, 500);
    }

    const imageResponse = await fetchUpstream(outputUrls[0], {
        errorLabel: `Failed to download ${modelLabel} output image`,
    });
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(
        `${modelLabel} image downloaded:`,
        (imageBuffer.length / 1024).toFixed(1),
        "KB",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: trackingLabel,
            // Flat per-image pricing on Replicate; report 1 image token.
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
