import { UpstreamError } from "@shared/error.ts";
import { getOpenAIImageUsage } from "@shared/registry/usage-headers.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    base64ToBuffer,
    detectMimeType,
    readImageDimensions,
    toDataUri,
} from "../utils/imageDownload.ts";

function imageSize(params: ImageParams, firstReference?: string) {
    let ratio = params.width / params.height;
    if (params.aspectRatio === "adaptive" && firstReference) {
        const buffer = base64ToBuffer(firstReference);
        const size = readImageDimensions(buffer, detectMimeType(buffer));
        if (size) ratio = size.width / size.height;
    } else if (params.aspectRatio && params.aspectRatio !== "adaptive") {
        const [width, height] = params.aspectRatio.split(":").map(Number);
        ratio = width / height;
    }
    // fal accepts a pixel area and a width:height ratio from 1:3 to 3:1.
    const aspect = Math.sqrt(Math.min(3, Math.max(1 / 3, ratio)));
    const side =
        params.resolution === "4k"
            ? 4096
            : params.resolution === "2k"
              ? 2048
              : 1024;
    return {
        width: Math.round(side * aspect),
        height: Math.round(side / aspect),
    };
}

export async function callFalMiniMaxH3Image(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const key = getImageEnv("FAL_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY is not configured",
        });
    const references = await Promise.all(params.image.map(toDataUri));
    const operation = references.length ? "edit" : "text-to-image";
    const response = await fetchUpstream(
        `https://fal.run/minimax/h3-image/${operation}`,
        {
            method: "POST",
            headers: {
                Authorization: `Key ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                image_size: imageSize(params, references[0]),
                ...(references.length ? { image_urls: references } : {}),
                seed: params.seed,
                output_format: "png",
            }),
            errorLabel: "fal H3 Image request failed",
        },
    );
    // Both fal endpoints meter weighted units at $0.001 per unit.
    const cost = falBillableUnits(response) * 0.001;
    const data = (await response.json()) as { images?: { url?: string }[] };
    const usage = getOpenAIImageUsage(data);
    const url = data.images?.[0]?.url;
    if (!url)
        throw UpstreamError.fromProvider(502, {
            message: "fal H3 Image returned no image",
        });
    const image = await fetchUpstream(url, {
        errorLabel: "fal H3 Image download failed",
    });
    return {
        buffer: Buffer.from(await image.arrayBuffer()),
        trackingData: {
            actualModel: params.model,
            usage: usage
                ? {
                      promptTextTokens: usage.input_tokens_details.text_tokens,
                      promptImageTokens:
                          usage.input_tokens_details.image_tokens,
                      completionImageTokens: usage.output_tokens,
                  }
                : {},
            providerBilling: { units: cost, unitCost: 1 },
        },
    };
}
