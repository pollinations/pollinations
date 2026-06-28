import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import { closestByRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    ensureBaselineJpeg,
    isProgressiveJpeg,
    transformImage,
} from "../utils/imageTransform.ts";

const logOps = debug("pollinations:fireworks-flux:ops");

const FIREWORKS_FLUX_SCHNELL_URL =
    "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image";

const FIREWORKS_ASPECT_RATIOS: Array<{ ratio: number; label: string }> = [
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

export async function callFireworksFluxSchnellAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FIREWORKS_API_KEY");
    if (!apiKey) {
        throw new HttpError("FIREWORKS_API_KEY is required for Flux", 500);
    }

    const aspectRatio = closestByRatio(
        safeParams.width || 1024,
        safeParams.height || 1024,
        FIREWORKS_ASPECT_RATIOS,
    ).label;

    const body = {
        prompt: sanitizeString(prompt),
        aspect_ratio: aspectRatio,
        num_inference_steps: 4,
        seed: safeParams.seed,
    };

    logOps("Calling Fireworks FLUX.1 schnell:", {
        aspectRatio,
        seed: safeParams.seed,
    });

    const response = await fetchUpstream(FIREWORKS_FLUX_SCHNELL_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "image/jpeg",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        errorLabel: "Fireworks FLUX generation failed",
    });

    const finishReason = response.headers.get("finish-reason");
    if (finishReason && finishReason !== "SUCCESS") {
        throw new HttpError(
            `Fireworks FLUX generation failed: ${finishReason}`,
            finishReason === "CONTENT_FILTERED" ? 400 : 502,
            undefined,
            FIREWORKS_FLUX_SCHNELL_URL,
        );
    }

    let buffer: Buffer = Buffer.from(await response.arrayBuffer());

    if (safeParams.dimensionsExplicit) {
        buffer = await transformImage(buffer, {
            width: safeParams.width,
            height: safeParams.height,
            fit: "cover",
            format: "image/jpeg",
            quality: 90,
            forceBaseline: true,
        });
        logOps("Image resized and converted to baseline JPEG");
    } else {
        const beforeIsProgressive = isProgressiveJpeg(buffer);
        buffer = await ensureBaselineJpeg(buffer, 90);
        const afterIsProgressive = isProgressiveJpeg(buffer);

        if (beforeIsProgressive && !afterIsProgressive) {
            logOps("Converted progressive JPEG to baseline JPEG");
        } else if (!beforeIsProgressive) {
            logOps("Image already baseline JPEG, no conversion needed");
        }
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
