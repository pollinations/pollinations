import { IMAGE_SERVICES, type ImageModelName } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
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
        duration: z.coerce.number().optional(),
        fps: z.coerce.number().optional(),
        resolution: z
            .enum(["1k", "2k", "480p", "720p", "768p", "1080p"])
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
            if (data.image.length > 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["image"],
                    message: "minimax-h3 currently supports text input only.",
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
