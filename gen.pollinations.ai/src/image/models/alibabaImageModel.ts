import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ImageParams } from "../params.ts";
import {
    callAlibabaMedia,
    requireAlibabaUsage,
} from "../utils/alibabaClient.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import { resolveQwenImageSize } from "./qwenImage3Model.ts";
import { resolveWanImageSize } from "./wanImageModel.ts";

const QWEN_PRESET_SIZES = {
    square_hd: "1024*1024",
    landscape_4_3: "1024*768",
    portrait_4_3: "768*1024",
    landscape_16_9: "1024*576",
    portrait_16_9: "576*1024",
} as const;

export async function callAlibabaImage(
    prompt: string,
    params: ImageParams,
    model: "wan2.7-image" | "qwen-image-3.0-pro",
): Promise<ImageGenerationResult> {
    const qwen = model === "qwen-image-3.0-pro";
    const images = params.image ?? [];
    const maxImages = qwen ? 3 : 9;
    if (images.length > maxImages) {
        throw UpstreamError.fromProvider(400, {
            message: `This model supports at most ${maxImages} reference images`,
        });
    }
    let size: string;
    if (qwen) {
        const pixels = params.width * params.height;
        if (
            params.width <= 0 ||
            params.height <= 0 ||
            pixels < 512 * 512 ||
            pixels > 2048 * 2048
        ) {
            throw UpstreamError.fromProvider(400, {
                message:
                    "qwen-image-3 output must contain between 512×512 and 2048×2048 total pixels",
            });
        }
        const requested = resolveQwenImageSize(params);
        size =
            typeof requested === "string"
                ? QWEN_PRESET_SIZES[requested]
                : `${requested.width}*${requested.height}`;
    } else {
        size = resolveWanImageSize(params);
    }
    const imageUrls = await Promise.all(images.map(toDataUri));
    const result = await callAlibabaMedia(
        qwen
            ? "/services/aigc/image-generation/generation"
            : "/services/aigc/multimodal-generation/generation",
        {
            model,
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            ...imageUrls.map((image) => ({ image })),
                            { text: prompt },
                        ],
                    },
                ],
            },
            parameters: {
                size,
                n: 1,
                seed: params.seed,
                watermark: false,
                ...(qwen ? { prompt_extend: false } : { thinking_mode: false }),
            },
        },
        qwen,
    );
    const url = result.output?.choices?.[0]?.message?.content?.find(
        (item) => item.image,
    )?.image;
    if (!url)
        throw UpstreamError.fromProvider(502, {
            message: "Alibaba returned no image",
        });
    const outputCount = requireAlibabaUsage(
        qwen ? result.usage?.output_image_count : result.usage?.image_count,
        "output image count",
    );
    const inputCount = qwen
        ? requireAlibabaUsage(
              result.usage?.input_image_count,
              "input image count",
              true,
          )
        : 0;
    const image = await fetchUpstream(url, {
        errorLabel: "Failed to download Alibaba image",
    });
    return {
        buffer: Buffer.from(await image.arrayBuffer()),
        mimeType: image.headers.get("content-type") || "image/png",
        trackingData: {
            actualModel: params.model,
            // Wan text-token counts are included in its flat per-image charge.
            usage: {
                completionImageTokens: outputCount,
                ...(qwen ? { promptImageTokens: inputCount } : {}),
            },
        },
    };
}
