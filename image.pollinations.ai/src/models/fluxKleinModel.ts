import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:flux-klein:ops");
const logError = debug("pollinations:flux-klein:error");

// bpaigen.com endpoint for Klein 4B
const BPAI_BASE_URL = "https://bpaigen.com";
const BPAI_GENERATE_URL = `${BPAI_BASE_URL}/v1/images/generate`;

/**
 * Calls the Flux Klein API for image generation via bpaigen.com (4B)
 */
export const callFluxKleinAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    try {
        const hasReferenceImages =
            safeParams.image && safeParams.image.length > 0;

        if (hasReferenceImages) {
            return await generateWithBpaiEditing(
                prompt,
                safeParams,
                progress,
                requestId,
            );
        }

        return await generateWithBpai(prompt, safeParams, progress, requestId);
    } catch (error) {
        logError("Error calling Flux Klein API:", error);
        if (error instanceof HttpError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Flux Klein API generation failed: ${message}`);
    }
};

/**
 * Klein 4B text-to-image via bpaigen.com
 */
async function generateWithBpai(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    logOps("Calling bpaigen.com Klein 4B with prompt:", prompt);

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Generating with Flux Klein (4B)...",
    );

    return await callBpaiApi(prompt, safeParams, requestId, progress, {
        width: safeParams.width || 1024,
        height: safeParams.height || 1024,
    });
}

/**
 * Klein 4B image editing via bpaigen.com (img2img)
 */
async function generateWithBpaiEditing(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    logOps(
        "Using bpaigen.com Klein 4B editing mode with",
        safeParams.image?.length,
        "images",
    );

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Downloading reference image...",
    );

    const imageUrl = safeParams.image?.[0];
    const { base64 } = await downloadImageAsBase64(imageUrl);

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating with Flux Klein (4B) editing...",
    );

    return await callBpaiApi(prompt, safeParams, requestId, progress, {
        image: base64,
        strength: 1,
    });
}

type BpaiResponse = {
    status: string;
    image_url: string;
    seed: number;
    job_id: string;
};

/**
 * Shared helper for bpaigen.com API calls (both generate and edit).
 * Callers pass mode-specific fields via extraBody.
 */
async function callBpaiApi(
    prompt: string,
    safeParams: ImageParams,
    requestId: string,
    progress: ProgressManager,
    extraBody: Record<string, unknown>,
): Promise<ImageGenerationResult> {
    const body: Record<string, unknown> = { prompt, ...extraBody };

    if (safeParams.seed !== undefined) {
        body.seed = safeParams.seed;
    }

    const password = process.env.BPAI_PASSWORD;
    if (password) {
        body.password = password;
    }

    logOps("bpaigen request body keys:", Object.keys(body).join(", "));

    const response = await fetch(BPAI_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "bpaigen API failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `bpaigen API request failed: ${errorText}`,
            response.status,
        );
    }

    const result = (await response.json()) as BpaiResponse;

    if (result.status !== "succeeded") {
        throw new Error(
            `bpaigen generation failed with status: ${result.status}`,
        );
    }

    logOps("bpaigen job succeeded, downloading from:", result.image_url);

    const imageResponse = await fetch(`${BPAI_BASE_URL}${result.image_url}`);
    if (!imageResponse.ok) {
        throw new HttpError(
            `bpaigen image download failed: ${imageResponse.status}`,
            imageResponse.status,
        );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps(
        "Downloaded image, buffer size:",
        imageBuffer.length,
        "seed:",
        result.seed,
    );

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Flux Klein generation completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "klein",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
