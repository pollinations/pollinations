import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const ZIMAGE_FAL_ENDPOINT = "https://fal.run/fal-ai/z-image/turbo";
const ZIMAGE_FAL_TIMEOUT_MS = 120_000;

type FalZImageResponse = {
    images?: Array<{
        url?: string;
        content_type?: string;
    }>;
    has_nsfw_concepts?: boolean[];
};

async function readFalResponse(response: Response): Promise<FalZImageResponse> {
    try {
        return (await response.json()) as FalZImageResponse;
    } catch {
        throw new HttpError("Z-Image Fal returned invalid JSON", 502);
    }
}

export async function callZImageFalAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw new HttpError("Z-Image Fal fallback is not configured", 500);
    }

    const response = await fetchUpstream(ZIMAGE_FAL_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt,
            image_size: {
                width: safeParams.width,
                height: safeParams.height,
            },
            num_inference_steps: 4,
            seed: safeParams.seed,
            num_images: 1,
            output_format: "jpeg",
            enable_prompt_expansion: false,
        }),
        signal: AbortSignal.timeout(ZIMAGE_FAL_TIMEOUT_MS),
        errorLabel: "Z-Image Fal generation failed",
    });
    const result = await readFalResponse(response);
    const image = result.images?.[0];
    if (!image?.url) {
        throw new HttpError("Z-Image Fal returned no image", 502);
    }

    const imageResponse = await fetchUpstream(image.url, {
        signal: AbortSignal.timeout(ZIMAGE_FAL_TIMEOUT_MS),
        errorLabel: "Failed to download Z-Image Fal output",
    });

    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        mimeType:
            image.content_type ||
            imageResponse.headers.get("content-type") ||
            undefined,
        isMature: result.has_nsfw_concepts?.[0] ?? false,
        isChild: false,
        trackingData: {
            actualModel: "zimage-fal",
            usage: { completionImageTokens: 1 },
        },
    };
}
