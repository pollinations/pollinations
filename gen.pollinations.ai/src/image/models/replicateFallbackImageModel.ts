import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    downloadUserImage,
    readImageDimensions,
    toDataUri,
} from "../utils/imageDownload.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

type ReplicateFallbackModel =
    | "kontext-replicate"
    | "flux-2-pro-replicate"
    | "qwen-image-3-replicate"
    | "p-image-edit-replicate"
    | "krea-replicate";

const COMMON_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "4:5",
    "5:4",
] as const;

const QWEN_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "2:1",
    "1:2",
] as const;

const KREA_RATIOS = [
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "2.35:1",
    "4:5",
    "2:3",
    "9:16",
] as const;

async function runReplicateImage(
    model: string,
    input: Record<string, unknown>,
    label: string,
): Promise<Buffer> {
    try {
        const { output } = await runReplicatePrediction<
            Record<string, unknown>,
            string | string[]
        >({ model, input });
        const url = Array.isArray(output) ? output[0] : output;
        if (!url)
            throw UpstreamError.fromProvider(502, {
                message: `${label} returned no image`,
            });
        const response = await fetchUpstream(url, {
            errorLabel: `Failed to download ${label} output`,
        });
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        throw toReplicateUpstreamError(error, `${label} generation failed`);
    }
}

async function prepareFluxImages(
    urls: string[],
): Promise<{ dataUris: string[]; megapixels: number }> {
    let megapixels = 0;
    const dataUris = await Promise.all(
        urls.map(async (url) => {
            const { buffer, mimeType } = await downloadUserImage(url);
            const dimensions = readImageDimensions(buffer, mimeType);
            if (dimensions) {
                megapixels +=
                    (dimensions.width * dimensions.height) / 1_000_000;
            }
            return `data:${mimeType};base64,${buffer.toString("base64")}`;
        }),
    );
    return { dataUris, megapixels };
}

function closestRatio(params: ImageParams, ratios: readonly string[]): string {
    return closestRatioLogSpace(params.width, params.height, ratios);
}

export async function callReplicateFallbackImage(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const model = params.model as ReplicateFallbackModel;
    let buffer: Buffer;
    let promptImageTokens = 0;
    let completionImageTokens = 1;

    switch (model) {
        case "flux-2-pro-replicate": {
            if (params.image.length > 8) {
                throw UpstreamError.fromProvider(400, {
                    message: "FLUX.2 Pro supports at most 8 reference images",
                });
            }
            const images = await prepareFluxImages(params.image);
            promptImageTokens = images.megapixels;
            completionImageTokens = (params.width * params.height) / 1_000_000;
            buffer = await runReplicateImage(
                "black-forest-labs/flux-2-pro",
                {
                    prompt,
                    input_images: images.dataUris,
                    aspect_ratio: "custom",
                    width: params.width,
                    height: params.height,
                    output_format: "png",
                    seed: params.seed,
                },
                "FLUX.2 Pro",
            );
            break;
        }
        case "kontext-replicate": {
            const images = await prepareFluxImages(params.image.slice(0, 1));
            buffer = await runReplicateImage(
                "black-forest-labs/flux-kontext-pro",
                {
                    prompt,
                    ...(images.dataUris[0]
                        ? { input_image: images.dataUris[0] }
                        : {}),
                    aspect_ratio: images.dataUris[0]
                        ? "match_input_image"
                        : closestRatio(params, COMMON_RATIOS),
                    output_format: "png",
                    prompt_upsampling: false,
                    seed: params.seed,
                },
                "FLUX.1 Kontext Pro",
            );
            break;
        }
        case "qwen-image-3-replicate": {
            const image = params.image[0]
                ? await toDataUri(params.image[0])
                : undefined;
            promptImageTokens = params.image.length;
            buffer = await runReplicateImage(
                "alibaba/qwen-image-3",
                {
                    prompt,
                    ...(image ? { image } : {}),
                    aspect_ratio: closestRatio(params, QWEN_RATIOS),
                    match_input_image: false,
                    enable_prompt_expansion: false,
                    seed: params.seed,
                },
                "Qwen Image 3",
            );
            break;
        }
        case "p-image-edit-replicate": {
            if (params.image.length === 0) {
                throw UpstreamError.fromProvider(400, {
                    message: "p-image-edit requires at least one input image",
                });
            }
            if (params.image.length > 5) {
                throw UpstreamError.fromProvider(400, {
                    message: "p-image-edit supports at most 5 input images",
                });
            }
            buffer = await runReplicateImage(
                "prunaai/p-image-edit",
                {
                    prompt,
                    images: await Promise.all(params.image.map(toDataUri)),
                    aspect_ratio: "match_input_image",
                    seed: params.seed,
                },
                "Pruna p-image-edit",
            );
            break;
        }
        case "krea-replicate": {
            if (params.image.length > 0) {
                throw UpstreamError.fromProvider(400, {
                    message: "Krea does not accept image input",
                });
            }
            buffer = await runReplicateImage(
                "krea/krea-2-medium",
                {
                    prompt,
                    aspect_ratio: closestRatio(params, KREA_RATIOS),
                    seed: params.seed,
                },
                "Krea 2 Medium",
            );
            break;
        }
        default:
            throw UpstreamError.fromProvider(400, {
                message: `Unsupported Replicate fallback model: ${model}`,
            });
    }

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: model,
            usage: {
                ...(promptImageTokens > 0 ? { promptImageTokens } : {}),
                completionImageTokens,
            },
        },
    };
}
