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

// Modal endpoints for Klein Large (9B) only
const KLEIN_LARGE_ENDPOINTS = {
    generate:
        "https://myceli-ai--flux-klein-9b-fluxklein9b-generate-web.modal.run",
    edit: "https://myceli-ai--flux-klein-9b-fluxklein9b-edit-web.modal.run",
} as const;

type KleinVariant = "klein" | "klein-large";

/**
 * Calls the Flux Klein API for image generation
 * - klein (4B): uses bpaigen.com (text-to-image + editing)
 * - klein-large (9B): uses Modal (text-to-image + editing)
 */
export const callFluxKleinAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    variant: KleinVariant = "klein",
): Promise<ImageGenerationResult> => {
    try {
        if (variant === "klein") {
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

            return await generateWithBpai(
                prompt,
                safeParams,
                progress,
                requestId,
            );
        }

        // klein-large uses Modal
        const backendToken = process.env.PLN_IMAGE_BACKEND_TOKEN;
        if (!backendToken) {
            throw new Error(
                "PLN_IMAGE_BACKEND_TOKEN environment variable is required",
            );
        }

        const hasReferenceImages =
            safeParams.image && safeParams.image.length > 0;

        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Flux Klein Large (9B)...",
        );

        if (hasReferenceImages) {
            return await generateWithEditingModal(
                prompt,
                safeParams,
                progress,
                requestId,
                backendToken,
            );
        }

        return await generateTextToImageModal(
            prompt,
            safeParams,
            progress,
            requestId,
            backendToken,
        );
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

    const body: Record<string, unknown> = {
        prompt,
        width: safeParams.width || 1024,
        height: safeParams.height || 1024,
    };

    if (safeParams.seed !== undefined) {
        body.seed = safeParams.seed;
    }

    const password = process.env.BPAI_PASSWORD;
    if (password) {
        body.password = password;
    }

    logOps("bpaigen request body:", JSON.stringify(body));

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

    const result = (await response.json()) as {
        status: string;
        image_url: string;
        seed: number;
        job_id: string;
    };

    if (result.status !== "succeeded") {
        throw new Error(
            `bpaigen generation failed with status: ${result.status}`,
        );
    }

    logOps("bpaigen job succeeded, downloading from:", result.image_url);

    // Download the generated image
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

    // Download the first reference image and convert to base64
    const imageUrl = safeParams.image?.[0];
    const { base64 } = await downloadImageAsBase64(imageUrl);

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating with Flux Klein (4B) editing...",
    );

    const body: Record<string, unknown> = {
        prompt,
        image: base64,
        strength: 1,
    };

    if (safeParams.seed !== undefined) {
        body.seed = safeParams.seed;
    }

    const password = process.env.BPAI_PASSWORD;
    if (password) {
        body.password = password;
    }

    logOps("bpaigen edit request, prompt:", prompt);

    const response = await fetch(BPAI_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "bpaigen edit API failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `bpaigen edit API request failed: ${errorText}`,
            response.status,
        );
    }

    const result = (await response.json()) as {
        status: string;
        image_url: string;
        seed: number;
        job_id: string;
    };

    if (result.status !== "succeeded") {
        throw new Error(`bpaigen edit failed with status: ${result.status}`);
    }

    logOps("bpaigen edit succeeded, downloading from:", result.image_url);

    const imageResponse = await fetch(`${BPAI_BASE_URL}${result.image_url}`);
    if (!imageResponse.ok) {
        throw new HttpError(
            `bpaigen image download failed: ${imageResponse.status}`,
            imageResponse.status,
        );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps("Downloaded edited image, buffer size:", imageBuffer.length);

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

/**
 * Klein Large (9B) text-to-image via Modal GET endpoint
 */
async function generateTextToImageModal(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    backendToken: string,
): Promise<ImageGenerationResult> {
    logOps("Using Modal text-to-image mode (GET) for Klein Large");

    const params = new URLSearchParams({
        prompt: prompt,
        width: String(safeParams.width || 1024),
        height: String(safeParams.height || 1024),
    });

    if (safeParams.seed !== undefined) {
        params.append("seed", String(safeParams.seed));
    }

    const url = `${KLEIN_LARGE_ENDPOINTS.generate}?${params.toString()}`;
    logOps("Klein Large GET URL:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: { "x-backend-token": backendToken },
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "Klein Large API failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `Klein Large API request failed: ${errorText}`,
            response.status,
        );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logOps("Generated image, buffer size:", imageBuffer.length);

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Klein Large generation completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "klein-large",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/**
 * Klein Large (9B) image editing via Modal POST endpoint
 */
async function generateWithEditingModal(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    backendToken: string,
): Promise<ImageGenerationResult> {
    logOps(
        "Using Modal editing mode (POST) for Klein Large with",
        safeParams.image?.length,
        "images",
    );

    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Downloading reference images...",
    );

    const imageUrls = Array.isArray(safeParams.image)
        ? safeParams.image.slice(0, 10)
        : [safeParams.image];

    const base64Images: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        try {
            logOps(
                `Downloading reference image ${i + 1}/${imageUrls.length} from: ${imageUrl}`,
            );
            const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
            base64Images.push(`data:${mimeType};base64,${base64}`);
            logOps(
                `Processed reference image ${i + 1}: ${mimeType}, ${base64.length} chars`,
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logError(`Error processing reference image ${i + 1}:`, message);
        }
    }

    if (base64Images.length === 0) {
        throw new Error("Failed to download any reference images");
    }

    const params = new URLSearchParams({
        prompt: prompt,
        width: String(safeParams.width || 1024),
        height: String(safeParams.height || 1024),
    });

    if (safeParams.seed !== undefined) {
        params.append("seed", String(safeParams.seed));
    }

    const editUrl = `${KLEIN_LARGE_ENDPOINTS.edit}?${params.toString()}`;
    logOps("Klein Large POST URL:", editUrl);

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating with Klein Large (editing)...",
    );

    const response = await fetch(editUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-backend-token": backendToken,
        },
        body: JSON.stringify(base64Images),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "Klein Large edit failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `Klein Large edit request failed: ${errorText}`,
            response.status,
        );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logOps("Generated edited image, buffer size:", imageBuffer.length);

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Klein Large editing completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "klein-large",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
