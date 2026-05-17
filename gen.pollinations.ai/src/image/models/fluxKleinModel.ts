import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, downloadUserImage } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:flux-klein:ops");
const logError = debug("pollinations:flux-klein:error");

// RunPod pod endpoint for Klein 4B (read lazily so dotenv has time to load)
const getKleinGenerateUrl = () =>
    `${getImageEnv("KLEIN_URL") || "https://lqh6weiexk4sth-8000.proxy.runpod.net"}/generate`;
const MAX_INPUT_IMAGES = 10;

/**
 * Calls the Flux Klein API for image generation via RunPod pod (4B)
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

        progress.updateBar(
            requestId,
            hasReferenceImages ? 25 : 35,
            "Processing",
            hasReferenceImages
                ? `Downloading ${safeParams.image.length} reference image(s)...`
                : "Generating with Flux Klein (4B)...",
        );

        // Download and encode reference images if provided
        let imagesB64: string[] = [];
        if (hasReferenceImages) {
            const imageUrls = (safeParams.image || []).slice(
                0,
                MAX_INPUT_IMAGES,
            );
            const downloads = await Promise.all(
                imageUrls.map((url) => downloadUserImage(url)),
            );
            imagesB64 = downloads.map(({ buffer }) =>
                buffer.toString("base64"),
            );
            progress.updateBar(
                requestId,
                50,
                "Processing",
                "Generating with Flux Klein (4B) editing...",
            );
        }

        const body: Record<string, unknown> = {
            prompts: [prompt],
            width: safeParams.width || 1024,
            height: safeParams.height || 1024,
            ...(safeParams.seed !== undefined && { seed: safeParams.seed }),
            ...(safeParams.guidance_scale !== undefined && {
                guidance_scale: safeParams.guidance_scale,
            }),
            ...(imagesB64.length > 0 && { images: imagesB64 }),
        };

        logOps(
            "Klein request to",
            getKleinGenerateUrl(),
            "keys:",
            Object.keys(body).join(", "),
        );

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        const backendToken = getImageEnv("PLN_GPU_TOKEN");
        if (backendToken) {
            headers["x-backend-token"] = backendToken;
        }

        const kleinUrl = getKleinGenerateUrl();
        const response = await fetchUpstream(kleinUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            errorLabel: "Klein API request failed",
        });

        const result = await response.json();
        const item = Array.isArray(result) ? result[0] : result;

        if (!item?.image) {
            throw new HttpError(
                "Klein API returned no image",
                500,
                undefined,
                kleinUrl,
            );
        }

        const imageBuffer = base64ToBuffer(item.image);
        logOps(
            "Klein generation complete, buffer size:",
            imageBuffer.length,
            "seed:",
            item.seed,
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
    } catch (error) {
        logError("Error calling Flux Klein API:", error);
        if (error instanceof HttpError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Flux Klein API generation failed: ${message}`);
    }
};
