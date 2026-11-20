import {
    HOTSHOT_XL_MODEL,
    HOTSHOT_XL_SIDE_LENGTH,
    IMAGE_SERVICES,
    type ImageModelName,
} from "@shared/registry/image.ts";
import {
    durationError,
    type ModelDefinition,
    type PricingInput,
} from "@shared/registry/registry.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import { z } from "zod";
import { normalizeSeed, parseBooleanLike, SENTINEL_SEED } from "@/util.ts";
import { getDefaultSideLength } from "./models.js";

const allowedModels = Object.keys(IMAGE_SERVICES) as [
    ImageModelName,
    ...ImageModelName[],
];
const validQualities = ["low", "medium", "high", "hd", "auto"] as const;
// Maximum seed value - use INT32_MAX for compatibility with strict providers like Vertex AI
const MAX_SEED = 2147483647; // INT32_MAX (2^31 - 1)

// Same tokens as the text route (1/yes/on); unrecognized values stay false.
const sanitizedBoolean = z
    .union([z.string(), z.boolean()])
    .transform((value) => parseBooleanLike(value) ?? false);

const sanitizedSeed = z.preprocess((v) => {
    const seed = String(v);
    const parsedSeed = Number.parseInt(seed, 10);
    const parsed = Number.isInteger(parsedSeed) ? parsedSeed : SENTINEL_SEED;
    return normalizeSeed(parsed);
}, z.int().min(0).max(MAX_SEED).catch(SENTINEL_SEED));

// Images need at least 16 px per side (gpt-image clamps up from 16); smaller
// values used to reach providers and leak their validation errors. Video
// models read width and height only as an aspect ratio, so 16x9 stays valid.
const MIN_IMAGE_SIDE = 16;

const sanitizedSideLength = z.preprocess((v) => {
    const parsed = Number.parseInt(v as string, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
}, z.int().positive().optional());

const parseReferenceUrls = (value: unknown): string[] => {
    const values = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split("|")
          : [];
    return values
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const referenceUrl = z.string().superRefine((value, ctx) => {
    if (!validateUserMediaUrl(value).ok) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
                "Reference media must use public HTTP(S) URLs without credentials or literal IP hosts.",
        });
    }
});

const referenceUrls = z.preprocess(parseReferenceUrls, z.array(referenceUrl));

export const CommunityReferenceParamsSchema = z.object({
    reference_images: referenceUrls.optional(),
    reference_videos: referenceUrls.optional(),
    reference_audios: referenceUrls.optional(),
});

function adjustImageSizeForModel(
    model: ImageModelName,
    width?: number,
    height?: number,
): { width: number; height: number } {
    const defaultSideLength = getDefaultSideLength(model);

    // Use provided dimensions or default - no scaling/limiting
    const sanitizedWidth =
        width !== undefined && Number.isInteger(width)
            ? width
            : defaultSideLength;
    const sanitizedHeight =
        height !== undefined && Number.isInteger(height)
            ? height
            : defaultSideLength;

    return { width: sanitizedWidth, height: sanitizedHeight };
}

export const ImageParamsSchema = z
    .object({
        width: sanitizedSideLength,
        height: sanitizedSideLength,
        seed: sanitizedSeed,
        model: z.enum(allowedModels),
        safe: sanitizedBoolean.catch(false),
        quality: z.string().catch("medium"),
        // GPT Image 2.6 output controls.
        output_format: z.enum(["png", "webp", "gif"]).optional(),
        frame_count: z.coerce.number().int().min(2).max(16).optional(),
        frame_duration_ms: z.coerce.number().int().min(20).max(2000).optional(),
        background: z.enum(["auto", "opaque", "transparent"]).optional(),
        image: z
            .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
            .transform((value?: string[] | string | null) => {
                if (!value) return [];
                // Already an array (from POST JSON body)
                if (Array.isArray(value)) return value;
                // Keep commas inside URLs, matching the public query schema.
                const urls = value.includes("|")
                    ? value.split("|")
                    : value.split(/,(?=\s*https?:\/\/)/);
                return urls.map((url) => url.trim()).filter(Boolean);
            })
            .catch([]),
        reference_images: referenceUrls.optional(),
        reference_videos: referenceUrls.optional(),
        reference_audios: referenceUrls.optional(),
        transparent: sanitizedBoolean.catch(false),
        reasoning: z
            .union([z.string(), z.boolean()])
            .transform((v) => {
                if (v === true || v === "true") return "pro";
                if (v === false || v === "false") return "balanced";
                const mode = String(v).toLowerCase();
                if (["fast", "balanced", "pro"].includes(mode)) return mode;
                return "balanced";
            })
            .catch("balanced"),
        guidance_scale: z.coerce.number().optional().catch(undefined),
        // Shared public bound; individual providers can narrow it further below.
        duration: z.coerce.number().int().min(1).max(120).optional(),
        fps: z.coerce.number().optional(),
        resolution: z
            .enum(["1k", "2k", "360p", "480p", "720p", "768p", "1080p", "4k"])
            .optional(),
        aspectRatio: z
            .enum([
                "16:9",
                "4:3",
                "1:1",
                "3:4",
                "9:16",
                "21:9",
                "9:21",
                "adaptive",
            ])
            .optional(),
        // Unset when omitted, so each model applies its own audio default.
        audio: sanitizedBoolean.optional().catch(undefined),
    })
    .superRefine((data, ctx) => {
        if (data.model === HOTSHOT_XL_MODEL) {
            if (data.output_format !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["output_format"],
                    message:
                        "Hotshot-XL always returns a GIF. Omit output_format.",
                });
            }
            if (
                (data.width !== undefined &&
                    data.width !== HOTSHOT_XL_SIDE_LENGTH) ||
                (data.height !== undefined &&
                    data.height !== HOTSHOT_XL_SIDE_LENGTH)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Hotshot-XL only supports 512x512 output.",
                });
            }
        }
        const isFlare =
            data.model === "openai/gpt-image-2.6-flare" ||
            data.model === "openai/gpt-image-2.6-flare:fal";
        const isSunburst =
            data.model === "openai/gpt-image-2.6-sunburst" ||
            data.model === "openai/gpt-image-2.6-sunburst:fal";
        if (data.output_format === "webp" && !isFlare) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["output_format"],
                message:
                    "WebP output is supported only by GPT Image 2.6 Flare.",
            });
        }
        if (data.output_format === "gif") {
            if (!isFlare && !isSunburst) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["output_format"],
                    message:
                        "GIF output is supported only by GPT Image 2.6 Flare and Sunburst.",
                });
            }
            if (
                data.frame_count === undefined ||
                data.frame_duration_ms === undefined
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["frame_count"],
                    message:
                        "GIF output requires frame_count and frame_duration_ms.",
                });
            } else if (data.frame_count * data.frame_duration_ms > 10000) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["frame_duration_ms"],
                    message: "GIF total duration must not exceed 10000 ms.",
                });
            }
            if (data.image.length > 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["image"],
                    message:
                        "GIF output is currently supported for image generation only.",
                });
            }
            if (data.transparent || data.background === "transparent") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["background"],
                    message:
                        "GIF output does not support transparent backgrounds.",
                });
            }
        } else if (
            data.frame_count !== undefined ||
            data.frame_duration_ms !== undefined
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["output_format"],
                message:
                    "frame_count and frame_duration_ms require output_format=gif.",
            });
        }
        if (data.resolution) {
            const supported = (IMAGE_SERVICES[data.model] as ModelDefinition)
                .resolutions;
            if (!supported?.includes(data.resolution)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["resolution"],
                    message: supported
                        ? `Resolution "${data.resolution}" is not supported by ${data.model}. Supported: ${supported.join(", ")}.`
                        : `${data.model} does not accept a resolution parameter.`,
                });
            }
        }
        if (data.model === "inferenceport-ai/lightning-image-turbo") {
            if (
                (data.width !== undefined && data.width !== 1024) ||
                (data.height !== undefined && data.height !== 1024)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        "inferenceport-ai/lightning-image-turbo only supports 1024x1024 output.",
                });
            }
        }
        const definition = IMAGE_SERVICES[data.model] as ModelDefinition;
        if (definition.category !== "video") {
            for (const side of ["width", "height"] as const) {
                const value = data[side];
                if (value !== undefined && value < MIN_IMAGE_SIDE) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: [side],
                        message: `Images need at least ${MIN_IMAGE_SIDE} px per side.`,
                    });
                }
            }
        }
        if (
            definition.maxReferenceImages !== undefined &&
            data.image &&
            data.image.length > definition.maxReferenceImages
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["image"],
                message: `${data.model} supports at most ${definition.maxReferenceImages} reference image${definition.maxReferenceImages === 1 ? "" : "s"}.`,
            });
        }
        const references = [
            {
                field: "reference_images" as const,
                values: data.reference_images ?? [],
                capability: "reference_images" as const,
            },
            {
                field: "reference_videos" as const,
                values: data.reference_videos ?? [],
                capability: "reference_videos" as const,
            },
            {
                field: "reference_audios" as const,
                values: data.reference_audios ?? [],
                capability: "reference_audios" as const,
            },
        ];
        if (
            data.model === "bytedance/seedance-2.5-flash" &&
            data.image?.length &&
            references.some(({ values }) => values.length > 0)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["image"],
                message:
                    "Seedance Flash keyframes cannot be combined with reference images, videos or audio.",
            });
        }
        for (const { field, values, capability } of references) {
            if (values.length === 0) continue;
            if (!definition.videoCapabilities?.includes(capability)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: `${data.model} does not support ${field}.`,
                });
            }
        }
        if (data.model === "heygen/heygen-avatar-6-turbo" || data.model === "heygen/heygen-avatar-6-turbo:openrouter") {
            const photos = data.image.length + (data.reference_images?.length ?? 0);
            const videos = data.reference_videos?.length ?? 0;
            if (photos > 1 || videos > 1 || photos + videos === 0 ||
                (data.reference_audios?.length ?? 0) !== 1) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Avatar 6 Turbo requires exactly one speech audio reference and a photo or reference video (at most one of each).",
                });
            }
            if (data.duration !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["duration"],
                    message: "Avatar 6 Turbo duration is determined by the supplied audio.",
                });
            }
        }
        const durationIssue =
            data.duration === undefined
                ? undefined
                : durationError(data.model, definition, data.duration);
        if (durationIssue) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["duration"],
                message: durationIssue,
            });
        }
        if (data.model === "minimax/minimax-h3") {
            if (data.aspectRatio !== undefined && data.aspectRatio !== "16:9") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["aspectRatio"],
                    message: "minimax-h3 currently supports 16:9 only.",
                });
            }
            if (data.fps !== undefined && data.fps !== 24) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["fps"],
                    message: "minimax-h3 outputs 24 FPS.",
                });
            }
        }
        if (
            data.model === "minimax/minimax-h3-max" ||
            data.model === "minimax/minimax-h3-max-turbo"
        ) {
            if (
                data.aspectRatio !== undefined &&
                !["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(
                    data.aspectRatio,
                )
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["aspectRatio"],
                    message: `${data.model} supports 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16.`,
                });
            }
            if (data.fps !== undefined && data.fps !== 24) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["fps"],
                    message: `${data.model} outputs video at 24 FPS.`,
                });
            }
        }
        if (data.model.startsWith("google/gemini-omni-")) {
            if (
                data.aspectRatio !== undefined &&
                !["16:9", "9:16"].includes(data.aspectRatio)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["aspectRatio"],
                    message: `${data.model} supports 16:9 or 9:16.`,
                });
            }
            if (data.fps !== undefined && data.fps !== 24) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["fps"],
                    message: `${data.model} outputs video at 24 FPS.`,
                });
            }
        }
        if (
            data.model === "x-ai/grok-imagine-image-2.0" &&
            !["low", "medium"].includes(data.quality)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["quality"],
                message:
                    "grok-imagine-image-2.0 supports low or medium quality.",
            });
        }
    })
    .transform((data) => {
        // Capture whether the caller actually specified dimensions BEFORE we
        // fill in model defaults. Models like seedream-4 can route to a
        // pixel-precise "custom" upstream path when this is true, instead of
        // approximating to a preset aspect ratio.
        const dimensionsExplicit =
            data.width !== undefined || data.height !== undefined;
        const { width, height } = adjustImageSizeForModel(
            data.model,
            data.width,
            data.height,
        );
        const quality = validQualities.includes(
            data.quality as (typeof validQualities)[number],
        )
            ? (data.quality as (typeof validQualities)[number])
            : "medium";

        // OpenAI clients ask for transparency with `background`; the
        // support check and PNG preservation read `transparent`.
        const transparent =
            data.transparent || data.background === "transparent";

        return {
            ...data,
            quality,
            width,
            height,
            dimensionsExplicit,
            transparent,
        };
    });

export type ImageParams = z.infer<typeof ImageParamsSchema>;

/** Request facts that select a model's rate sheet. Billing and price quotes share them. */
export function pricingInputFromParams(
    params: Omit<ImageParams, "model">,
): PricingInput {
    return {
        resolution: params.resolution,
        quality: params.quality,
        hasImage: (params.image?.length ?? 0) > 0,
        hasReferenceVideo: (params.reference_videos?.length ?? 0) > 0,
        maxImageDimension: Math.max(params.width, params.height),
        megapixels: (params.width * params.height) / 1_000_000,
    };
}
