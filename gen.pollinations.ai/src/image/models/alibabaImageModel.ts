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
    | "qwen-image-2.1-turbo";

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

// qwen-image-2.1-turbo accepts any size with 512*512 <= width*height <=
// 2560*2560, sent as 16px-aligned "W*H". Scale out-of-range areas
// proportionally, snap to the 16px grid, then re-clamp: rounding alone can
// push a borderline size back out of range.
const TURBO_MIN_AREA = 512 * 512;
const TURBO_MAX_AREA = 2560 * 2560;
const TURBO_STEP = 16;
const TURBO_FALLBACK = { width: 1024, height: 1024 };

export function resolveQwenImage21TurboSize(params: ImageParams): {
    width: number;
    height: number;
} {
    const { width, height } = params;
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return { ...TURBO_FALLBACK };
    }
    const area = width * height;
    let scaledWidth = width;
    let scaledHeight = height;
    if (area < TURBO_MIN_AREA || area > TURBO_MAX_AREA) {
        const target = area < TURBO_MIN_AREA ? TURBO_MIN_AREA : TURBO_MAX_AREA;
        const scale = Math.sqrt(target / area);
        scaledWidth = width * scale;
        scaledHeight = height * scale;
    }
    let resolvedWidth = Math.max(
        TURBO_STEP,
        Math.round(scaledWidth / TURBO_STEP) * TURBO_STEP,
    );
    let resolvedHeight = Math.max(
        TURBO_STEP,
        Math.round(scaledHeight / TURBO_STEP) * TURBO_STEP,
    );
    const resolvedArea = resolvedWidth * resolvedHeight;
    if (resolvedArea < TURBO_MIN_AREA) {
        const scale = Math.sqrt(TURBO_MIN_AREA / resolvedArea);
        resolvedWidth =
            Math.ceil((resolvedWidth * scale) / TURBO_STEP) * TURBO_STEP;
        resolvedHeight =
            Math.ceil((resolvedHeight * scale) / TURBO_STEP) * TURBO_STEP;
    } else if (resolvedArea > TURBO_MAX_AREA) {
        const scale = Math.sqrt(TURBO_MAX_AREA / resolvedArea);
        resolvedWidth =
            Math.floor((resolvedWidth * scale) / TURBO_STEP) * TURBO_STEP;
        resolvedHeight =
            Math.floor((resolvedHeight * scale) / TURBO_STEP) * TURBO_STEP;
        // Proportional floor can zero a razor-thin side; pin it and take the
        // whole reduction from the other side so the area bound still holds.
        if (resolvedWidth < TURBO_STEP) {
            resolvedWidth = TURBO_STEP;
            resolvedHeight =
                Math.floor(TURBO_MAX_AREA / resolvedWidth / TURBO_STEP) *
                TURBO_STEP;
        } else if (resolvedHeight < TURBO_STEP) {
            resolvedHeight = TURBO_STEP;
            resolvedWidth =
                Math.floor(TURBO_MAX_AREA / resolvedHeight / TURBO_STEP) *
                TURBO_STEP;
        }
    }
    return { width: resolvedWidth, height: resolvedHeight };
}

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
    // Any size from 512*512 to 2560*2560 pixels of area; Alibaba rejects the
    // rest with a 400. Up to 10 reference images, billed per output image.
    "qwen-image-2.1-turbo": {
        path: "/services/aigc/multimodal-generation/generation",
        asynchronous: false,
        size: (params) => {
            const { width, height } = resolveQwenImage21TurboSize(params);
            return `${width}*${height}`;
        },
        common: true,
        extra: { prompt_extend: false },
        acceptsImages: true,
        countKey: "image_count",
        billsInputImages: false,
    },
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
