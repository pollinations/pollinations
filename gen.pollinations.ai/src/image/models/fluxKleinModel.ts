import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, downloadUserImage } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:flux-klein:ops");
const logError = debug("pollinations:flux-klein:error");

let kleinVpc: Fetcher | undefined;

export function setKleinVpcBinding(binding: Fetcher | undefined): void {
    kleinVpc = binding;
}

// Production uses the private Vast tunnel; other environments retain KLEIN_URL.
const getKleinGenerateUrl = (): string => {
    if (kleinVpc) {
        return "http://127.0.0.1:8000/generate";
    }
    const url = getImageEnv("KLEIN_URL");
    if (!url) {
        throw new HttpError("KLEIN_URL is not configured", 500);
    }
    return `${url}/generate`;
};
const MAX_INPUT_IMAGES = 10;

/**
 * Calls the self-hosted Flux Klein 4B API. Production uses the Vast VPC binding.
 */
export const callFluxKleinAPI = async (
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> => {
    try {
        const hasReferenceImages =
            safeParams.image && safeParams.image.length > 0;

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
        const response = await fetchUpstream(
            kleinUrl,
            {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                errorLabel: "Klein API request failed",
            },
            kleinVpc?.fetch.bind(kleinVpc),
        );

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
