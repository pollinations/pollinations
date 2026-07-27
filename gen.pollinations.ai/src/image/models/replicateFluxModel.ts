import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import { closestByRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { transformImage } from "../utils/imageTransform.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:replicate-flux:ops");
const logError = debug("pollinations:replicate-flux:error");

const REPLICATE_FLUX_SCHNELL_MODEL = "black-forest-labs/flux-schnell";

const REPLICATE_ASPECT_RATIOS: Array<{ ratio: number; label: string }> = [
    { ratio: 1 / 1, label: "1:1" },
    { ratio: 21 / 9, label: "21:9" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 3 / 2, label: "3:2" },
    { ratio: 5 / 4, label: "5:4" },
    { ratio: 4 / 5, label: "4:5" },
    { ratio: 2 / 3, label: "2:3" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 9 / 21, label: "9:21" },
    { ratio: 4 / 3, label: "4:3" },
    { ratio: 3 / 4, label: "3:4" },
];

export async function callReplicateFluxSchnellAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const aspectRatio = closestByRatio(
        safeParams.width || 1024,
        safeParams.height || 1024,
        REPLICATE_ASPECT_RATIOS,
    ).label;
    const input = {
        prompt: sanitizeString(prompt),
        aspect_ratio: aspectRatio,
        num_inference_steps: 4,
        num_outputs: 1,
        output_format: "jpg",
        output_quality: 90,
        go_fast: true,
        megapixels: "1",
        seed: safeParams.seed,
    };

    logOps("Calling Replicate FLUX.1 Schnell:", {
        aspectRatio,
        seed: safeParams.seed,
    });

    let outputUrls: string[];
    try {
        const result = await runReplicatePrediction<typeof input, string[]>({
            model: REPLICATE_FLUX_SCHNELL_MODEL,
            input,
        });
        outputUrls = Array.isArray(result.output) ? result.output : [];
        logOps("Replicate FLUX.1 Schnell prediction succeeded:", {
            id: result.id,
            predict_time: result.predictTimeSeconds,
        });
    } catch (error) {
        logError("Replicate FLUX.1 Schnell prediction failed:", error);
        if (error instanceof ReplicateError) {
            throw new HttpError(
                `Replicate FLUX generation failed: ${error.message}`,
                error.status ?? 500,
                undefined,
                error.url,
            );
        }
        throw error;
    }

    if (outputUrls.length === 0) {
        throw new HttpError("Replicate FLUX returned no images", 500);
    }

    const response = await fetchUpstream(outputUrls[0], {
        errorLabel: "Failed to download Replicate FLUX output image",
    });
    let buffer = Buffer.from(await response.arrayBuffer());
    if (safeParams.dimensionsExplicit) {
        buffer = await transformImage(buffer, {
            width: safeParams.width,
            height: safeParams.height,
            fit: "cover",
            format: "image/jpeg",
            quality: 90,
        });
    }

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "flux",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
