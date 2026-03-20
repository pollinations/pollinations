import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";

const logOps = debug("pollinations:flux-klein:ops");
const logError = debug("pollinations:flux-klein:error");

// bpaigen.com endpoints for Klein 4B
const BPAI_BASE_URL = "https://bpaigen.com";
const BPAI_GENERATE_URL = `${BPAI_BASE_URL}/v1/images/generate`;
const BPAI_GENERATE_MULTIPART_URL = `${BPAI_BASE_URL}/v1/images/generate-multipart`;
const MAX_INPUT_IMAGES = 4;

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
 * Klein 4B image editing via bpaigen.com multipart endpoint (up to 4 images)
 */
async function generateWithBpaiEditing(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    const imageUrls = (safeParams.image || []).slice(0, MAX_INPUT_IMAGES);
    logOps(
        "Using bpaigen.com Klein 4B multipart editing with",
        imageUrls.length,
        "images",
    );

    progress.updateBar(
        requestId,
        25,
        "Processing",
        `Downloading ${imageUrls.length} reference image(s)...`,
    );

    // Download all input images in parallel
    const imageBuffers = await Promise.all(
        imageUrls.map(async (url) => {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new HttpError(
                    `Failed to download reference image: ${resp.status}`,
                    resp.status,
                );
            }
            return Buffer.from(await resp.arrayBuffer());
        }),
    );

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating with Flux Klein (4B) editing...",
    );

    // Build multipart form
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("wait", "true");
    formData.append("timeout_s", "300");

    if (safeParams.width) formData.append("width", String(safeParams.width));
    if (safeParams.height) formData.append("height", String(safeParams.height));
    if (safeParams.seed !== undefined)
        formData.append("seed", String(safeParams.seed));
    if (safeParams.guidance_scale !== undefined)
        formData.append("guidance_scale", String(safeParams.guidance_scale));

    const password = process.env.BPAI_PASSWORD;
    if (password) formData.append("password", password);

    for (let i = 0; i < imageBuffers.length; i++) {
        const blob = new Blob([imageBuffers[i]], {
            type: "image/png",
        });
        formData.append("images", blob, `image_${i}.png`);
    }

    logOps(
        "Sending multipart request with",
        imageBuffers.length,
        "images to",
        BPAI_GENERATE_MULTIPART_URL,
    );

    const response = await fetch(BPAI_GENERATE_MULTIPART_URL, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "bpaigen multipart API failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `bpaigen multipart API request failed: ${errorText}`,
            response.status,
        );
    }

    const result = (await response.json()) as BpaiResponse;

    if (result.status !== "succeeded") {
        throw new Error(
            `bpaigen generation failed with status: ${result.status}`,
        );
    }

    logOps(
        "bpaigen multipart job succeeded, downloading from:",
        result.image_url,
    );

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
        "Flux Klein editing completed",
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
