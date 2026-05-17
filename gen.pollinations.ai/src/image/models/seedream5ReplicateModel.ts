/**
 * ByteDance Seedream 5.0 Lite image generation via Replicate.
 *
 * Replaces the BytePlus ARK path for seedream5 (legacy seedream / seedream-pro
 * still use seedreamModel.ts). Replicate model: bytedance/seedream-5-lite
 *
 * Pricing on Replicate is flat per image (no resolution tiering), so no
 * registry changes for per-tier costs.
 *
 * Schema differences vs BytePlus:
 *   - No pixel dimensions; only `size: 2K | 3K` + `aspect_ratio` enum.
 *   - Multiple reference images via `image_input: string[]` (BytePlus used
 *     `image: string | string[]`).
 *   - Aspect ratio set "match_input_image" by default when an image is given.
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

const logOps = debug("pollinations:seedream5:ops");
const logError = debug("pollinations:seedream5:error");

const MODEL = "bytedance/seedream-5-lite";
const TRACKING_LABEL = "seedream5";

/** Replicate's accepted aspect ratios for seedream-5-lite. */
const SEEDREAM5_ASPECT_RATIOS = [
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
type Seedream5AspectRatio = (typeof SEEDREAM5_ASPECT_RATIOS)[number];

/**
 * Map our ImageParams.aspectRatio enum (16:9, 4:3, 1:1, 3:4, 9:16, 21:9, 9:21,
 * adaptive) to Replicate's enum. "9:21" has no direct match — closest visual
 * is "9:16", but rather than silently round we surface 400. "adaptive" maps to
 * "match_input_image" so the user gets what they intend when passing an image.
 */
function resolveSeedream5AspectRatio(
    requested: ImageParams["aspectRatio"] | undefined,
    hasImage: boolean,
): Seedream5AspectRatio {
    if (!requested) return hasImage ? "match_input_image" : "1:1";
    if (requested === "adaptive") return "match_input_image";
    if (requested === "9:21") {
        throw new HttpError(
            `aspectRatio "9:21" is not supported by Seedream 5.0 Lite. Supported: ${SEEDREAM5_ASPECT_RATIOS.join(", ")}.`,
            400,
        );
    }
    if ((SEEDREAM5_ASPECT_RATIOS as readonly string[]).includes(requested)) {
        return requested as Seedream5AspectRatio;
    }
    throw new HttpError(
        `aspectRatio "${requested}" is not supported by Seedream 5.0 Lite. Supported: ${SEEDREAM5_ASPECT_RATIOS.join(", ")}.`,
        400,
    );
}

/**
 * Pick "2K" (≤2048px longer side) or "3K" (>2048px) based on user-requested
 * dimensions. Default 2K when no dimensions are provided.
 */
function resolveSeedream5Size(
    width: number | undefined,
    height: number | undefined,
): "2K" | "3K" {
    const longer = Math.max(width ?? 0, height ?? 0);
    return longer > 2048 ? "3K" : "2K";
}

interface Seedream5Input {
    prompt: string;
    size: "2K" | "3K";
    aspect_ratio: Seedream5AspectRatio;
    image_input: string[];
    output_format: "png" | "jpeg";
    sequential_image_generation: "disabled";
    max_images: 1;
    seed?: number;
}

export async function callSeedream5API(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting Seedream 5.0 Lite generation...",
    );

    const images = safeParams.image ?? [];
    const hasImage = images.length > 0;

    // Replicate caps multi-reference at 14 images. Validate at the boundary.
    if (images.length > 14) {
        throw new HttpError(
            `Seedream 5.0 Lite supports at most 14 reference images (received ${images.length}).`,
            400,
        );
    }

    // Replicate's URL fetcher chokes on query strings and missing extensions
    // (same issue seen in seedance-2.0). Download here and pass data URIs.
    const toDataUri = async (url: string): Promise<string> => {
        const { buffer, mimeType } = await downloadUserImage(url);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
    };
    const imageInput = hasImage
        ? await Promise.all(images.map((url) => toDataUri(url)))
        : [];

    if (hasImage) {
        progress.updateBar(
            requestId,
            45,
            "Processing",
            `Processed ${imageInput.length} reference image(s)`,
        );
    }

    const input: Seedream5Input = {
        prompt,
        size: resolveSeedream5Size(safeParams.width, safeParams.height),
        aspect_ratio: resolveSeedream5AspectRatio(
            safeParams.aspectRatio,
            hasImage,
        ),
        image_input: imageInput,
        output_format: "png",
        sequential_image_generation: "disabled",
        max_images: 1,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }

    logOps("Seedream 5.0 input:", {
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
        const result = await runReplicatePrediction<Seedream5Input, string[]>({
            model: MODEL,
            input,
        });
        outputUrls = Array.isArray(result.output) ? result.output : [];
        logOps("Seedream 5.0 prediction succeeded:", {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            output_count: outputUrls.length,
        });
    } catch (err) {
        logError("Seedream 5.0 prediction call failed:", err);
        if (err instanceof ReplicateError) {
            logError("Replicate raw error details:", {
                message: err.message,
                status: err.status,
            });
            throw new HttpError(
                `Seedream 5.0 generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }

    if (outputUrls.length === 0) {
        throw new HttpError("Seedream 5.0 returned no images", 500);
    }

    progress.updateBar(
        requestId,
        80,
        "Processing",
        "Downloading generated image...",
    );
    const imageResponse = await fetchUpstream(outputUrls[0], {
        errorLabel: "Failed to download Seedream 5.0 output image",
    });
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(
        "Seedream 5.0 image downloaded:",
        (imageBuffer.length / 1024).toFixed(1),
        "KB",
    );

    progress.updateBar(
        requestId,
        95,
        "Success",
        "Seedream generation completed",
    );

    return {
        buffer: imageBuffer,
        // Seedream has built-in content filtering — preserve the existing
        // contract from the BytePlus path.
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: TRACKING_LABEL,
            // Flat per-image pricing on Replicate; report 1 image token
            // matching the prior BytePlus billing convention.
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
