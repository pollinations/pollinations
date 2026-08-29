import { IMAGE_SERVICES, type ImageModelName } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import { z } from "zod";
import { normalizeSeed, SENTINEL_SEED } from "@/util.ts";
import { getDefaultSideLength } from "./models.js";

const allowedModels = Object.keys(IMAGE_SERVICES) as [
    ImageModelName,
    ...ImageModelName[],
];
const validQualities = ["low", "medium", "high", "hd"] as const;
// Maximum seed value - use INT32_MAX for compatibility with strict providers like Vertex AI
const MAX_SEED = 2147483647; // INT32_MAX (2^31 - 1)

const sanitizedBoolean = z
    .union([z.string(), z.boolean()])
    .transform((value) => {
        if (typeof value === "boolean") return value;
        return value?.toString()?.toLowerCase?.() === "true";
    });

const sanitizedSeed = z.preprocess((v) => {
    const seed = String(v);
    const parsedSeed = Number.parseInt(seed, 10);
    const parsed = Number.isInteger(parsedSeed) ? parsedSeed : SENTINEL_SEED;
    return normalizeSeed(parsed);
}, z.int().min(0).max(MAX_SEED).catch(SENTINEL_SEED));

const sanitizedSideLength = z.preprocess((v) => {
    const parsed = Number.parseInt(v as string, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
}, z.int().optional());

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
        image: z
            .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
            .transform((value?: string[] | string | null) => {
                if (!value) return [];
                // Already an array (from POST JSON body)
                if (Array.isArray(value)) return value;
                // String: support both pipe (|) and comma (,) separators
                return value.includes("|")
                    ? value.split("|")
                    : value.split(",");
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
        // Video-specific parameters - pass through to backend, let provider validate
        duration: z.coerce.number().finite().positive().optional(),
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
        audio: sanitizedBoolean.catch(true), // generateAudio defaults to true
    })
    .superRefine((data, ctx) => {
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
        if (data.model === "gpt-image-2" && data.transparent) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["transparent"],
                message:
                    "Transparent backgrounds are not supported by gpt-image-2.",
            });
        }
        const definition = IMAGE_SERVICES[data.model] as ModelDefinition;
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
        if (data.model === "minimax-h3") {
            if (data.duration !== undefined && data.duration !== 5) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["duration"],
                    message: "minimax-h3 supports exactly 5 seconds.",
                });
            }
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
        if (data.model === "google/gemini-omni-1.1-flash") {
            if (
                data.aspectRatio !== undefined &&
                !["16:9", "9:16"].includes(data.aspectRatio)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["aspectRatio"],
                    message:
                        "google/gemini-omni-1.1-flash supports 16:9 or 9:16.",
                });
            }
            if (data.fps !== undefined && data.fps !== 24) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["fps"],
                    message:
                        "google/gemini-omni-1.1-flash outputs video at 24 FPS.",
                });
            }
        }
        if (
            data.model === "grok-imagine-image-2.0" &&
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

        return { ...data, quality, width, height, dimensionsExplicit };
    });

export type ImageParams = z.infer<typeof ImageParamsSchema>;
