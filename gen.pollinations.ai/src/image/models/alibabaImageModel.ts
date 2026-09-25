import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ImageParams } from "../params.ts";
import {
    callAlibabaMedia,
    requireAlibabaUsage,
} from "../utils/alibabaClient.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import { resolveQwenImage3Size } from "./falQwenImageModel.ts";
import { resolveWanImageSize } from "./wanImageModel.ts";

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
        const { width, height } = resolveQwenImage3Size(params);
        size = `${width}*${height}`;
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
        isMature: false,
        isChild: false,
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
