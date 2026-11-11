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

export type AlibabaImageModel =
    | "wan2.7-image"
    | "qwen-image-3.0-pro"
    | "qwen-image-2.1-turbo"
    | "qwen-image-2.1-pro";

type AlibabaImageRoute = {
    path: string;
    asynchronous: boolean;
    /** Omitted where the route's size list is not yet confirmed. */
    size?: (params: ImageParams) => string;
    /** n, seed and watermark: sent on the routes already in production. */
    common: boolean;
    extra: Record<string, unknown>;
    acceptsImages: boolean;
    countKey: "image_count" | "output_image_count";
    billsInputImages: boolean;
};

// Any size from 512*512 to 2560*2560 pixels of area; Alibaba rejects the
// rest with a 400. Up to 10 reference images, billed per output image.
// Pro shares this request shape until its size list is probed.
const QWEN_IMAGE_2_1_ROUTE: AlibabaImageRoute = {
    path: "/services/aigc/multimodal-generation/generation",
    asynchronous: false,
    size: (params) => `${params.width}*${params.height}`,
    common: true,
    extra: { prompt_extend: false },
    acceptsImages: true,
    countKey: "image_count",
    billsInputImages: false,
};

const ALIBABA_IMAGE_ROUTES: Record<AlibabaImageModel, AlibabaImageRoute> = {
    "wan2.7-image": {
        path: "/services/aigc/multimodal-generation/generation",
        asynchronous: false,
        size: resolveWanImageSize,
        common: true,
        extra: { thinking_mode: false },
        acceptsImages: true,
        countKey: "image_count",
        billsInputImages: false,
    },
    "qwen-image-3.0-pro": {
        path: "/services/aigc/image-generation/generation",
        asynchronous: true,
        size: (params) => {
            const { width, height } = resolveQwenImage3Size(params);
            return `${width}*${height}`;
        },
        common: true,
        extra: { prompt_extend: false },
        acceptsImages: true,
        countKey: "output_image_count",
        billsInputImages: true,
    },
    "qwen-image-2.1-turbo": QWEN_IMAGE_2_1_ROUTE,
    "qwen-image-2.1-pro": QWEN_IMAGE_2_1_ROUTE,
};

export async function callAlibabaImage(
    prompt: string,
    params: ImageParams,
    model: AlibabaImageModel,
): Promise<ImageGenerationResult> {
    const route = ALIBABA_IMAGE_ROUTES[model];
    const images = params.image ?? [];
    if (!route.acceptsImages && images.length > 0) {
        throw UpstreamError.fromProvider(400, {
            message: `${model} does not accept image input`,
        });
    }
    const parameters = {
        ...(route.size ? { size: route.size(params) } : {}),
        ...(route.common ? { n: 1, seed: params.seed, watermark: false } : {}),
        ...route.extra,
    };
    const imageUrls = await Promise.all(images.map(toDataUri));
    const result = await callAlibabaMedia(
        route.path,
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
            parameters,
        },
        route.asynchronous,
    );
    const url = result.output?.choices?.[0]?.message?.content?.find(
        (item) => item.image,
    )?.image;
    if (!url)
        throw UpstreamError.fromProvider(502, {
            message: "Alibaba returned no image",
        });
    const outputCount = requireAlibabaUsage(
        result.usage?.[route.countKey],
        "output image count",
    );
    const inputCount = route.billsInputImages
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
                ...(route.billsInputImages
                    ? { promptImageTokens: inputCount }
                    : {}),
            },
        },
    };
}
