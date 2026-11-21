import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const FAL_URL = "https://fal.run/fal-ai/recraft/v4/text-to-vector";
const SIZES: Record<string, string> = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
};
const RATIOS = Object.keys(SIZES);

export async function callRecraftV4VectorFalAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "Recraft fal route is not configured",
        });
    }
    // fal's text-to-vector route has no image-edit input.
    if (params.image.length > 0) {
        throw UpstreamError.fromProvider(400, {
            message: "Recraft V4 fal text-to-vector does not accept reference images",
        });
    }
    const requested = params.aspectRatio;
    const ratio = requested && requested !== "adaptive"
        ? requested
        : closestRatioLogSpace(params.width, params.height, RATIOS);
    const size = SIZES[ratio];
    if (!size) {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Recraft V4 vector aspect ratio: ${ratio}`,
        });
    }
    const response = await fetchUpstream(FAL_URL, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt,
            image_size: size,
            enable_safety_checker: true,
        }),
        signal: AbortSignal.timeout(120_000),
        errorLabel: "Recraft V4 vector generation failed",
    });
    const result = (await response.json()) as {
        images?: Array<{ url?: string; content_type?: string }>;
    };
    const image = result.images?.[0];
    if (!image?.url || image.content_type !== "image/svg+xml") {
        throw UpstreamError.fromProvider(502, {
            message: "Recraft V4 fal returned no SVG",
        });
    }
    const completionImageTokens = falBillableUnits(response);
    const output = await fetchUpstream(image.url, {
        errorLabel: "Could not download Recraft V4 SVG",
    });
    return {
        buffer: Buffer.from(await output.arrayBuffer()),
        mimeType: "image/svg+xml",
        trackingData: {
            actualModel: params.model,
            usage: { completionImageTokens },
        },
    };
}
