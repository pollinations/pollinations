/**
 * Alibaba Qwen-Image generation via Replicate.
 *
 * Moved off Alibaba DashScope (provider consolidation onto Replicate, which we
 * already use for Seedream/Seedance). Replicate models:
 *   - text-to-image → qwen/qwen-image            ($0.025/img)
 *   - image editing → qwen/qwen-image-edit-plus  ($0.03/img, multi-image)
 *
 * We bill a single $0.03/img rate (registry), so the t2i path runs slightly
 * under cost — acceptable, and avoids under-billing the edit path.
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

const logOps = debug("pollinations:qwen-image:ops");
const logError = debug("pollinations:qwen-image:error");

const QWEN_T2I_MODEL = "qwen/qwen-image";
const QWEN_EDIT_MODEL = "qwen/qwen-image-edit-plus";

// qwen/qwen-image text-to-image aspect_ratio enum (verified against live
// schema). Editing defaults to match_input_image, so no aspect mapping there.
const QWEN_ASPECT_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
] as const;
type QwenAspectRatio = (typeof QWEN_ASPECT_RATIOS)[number];

// qwen/qwen-image-edit-plus accepts a multi-image array; cap matches the prior
// DashScope edit path and registry maxReferenceImages: 3.
const QWEN_EDIT_MAX_IMAGES = 3;

/**
 * Map ImageParams.aspectRatio to Qwen's enum. Supported values pass through;
 * "adaptive"/"21:9"/"9:21"/unset round to the nearest enum by log-space ratio
 * (qwen has no 21:9/9:21), preserving the permissive prior DashScope behavior.
 */
function resolveAspectRatio(safeParams: ImageParams): QwenAspectRatio {
    const requested = safeParams.aspectRatio;
    if (
        requested &&
        requested !== "adaptive" &&
        (QWEN_ASPECT_RATIOS as readonly string[]).includes(requested)
    ) {
        return requested as QwenAspectRatio;
    }
    return closestRatioLogSpace(
        safeParams.width || 1024,
        safeParams.height || 1024,
        QWEN_ASPECT_RATIOS,
    );
}

/**
 * Generates an image using Alibaba Qwen-Image via Replicate. Routes to the edit
 * model when reference images are supplied, otherwise text-to-image.
 */
export async function callQwenImageAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const images = safeParams.image ?? [];
    const hasImage = images.length > 0;
    const modelLabel = hasImage ? "Qwen Image Edit" : "Qwen Image";

    let model: string;
    let input: Record<string, unknown>;

    if (hasImage) {
        const imageInput = await Promise.all(
            images.slice(0, QWEN_EDIT_MAX_IMAGES).map(toDataUri),
        );
        model = QWEN_EDIT_MODEL;
        input = {
            prompt,
            image: imageInput,
            output_format: "png",
            ...(safeParams.seed !== undefined ? { seed: safeParams.seed } : {}),
        };
    } else {
        model = QWEN_T2I_MODEL;
        input = {
            prompt,
            aspect_ratio: resolveAspectRatio(safeParams),
            output_format: "png",
            ...(safeParams.seed !== undefined ? { seed: safeParams.seed } : {}),
        };
    }

    logOps(`${modelLabel} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: hasImage ? `[${images.length} data uris]` : undefined,
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
            actualModel: hasImage ? "qwen-image-edit" : "qwen-image",
            // Flat per-image pricing on Replicate; report 1 image token.
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
