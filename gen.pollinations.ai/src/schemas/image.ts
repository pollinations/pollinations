import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import { SafeSchema } from "@shared/schemas/safety.ts";
import { z } from "zod";

const QUALITIES = ["low", "medium", "high", "hd"] as const;
// Maximum seed value - use INT32_MAX for compatibility with strict providers like Vertex AI
const MAX_SEED_VALUE = 2147483647; // INT32_MAX (2^31 - 1)

const NOVA_REEL_MODELS = new Set([
    "nova-reel",
    ...IMAGE_SERVICES["nova-reel"].aliases,
]);

const modelSchema = (defaultModel: string) =>
    z
        .preprocess(
            (val) => (val === "" ? undefined : val),
            z.string().trim().min(1).optional().default(defaultModel),
        )
        .meta({
            description:
                "Model to use. **Image:** flux, zimage, gptimage, kontext, seedream5, seedream5-pro, nanobanana, nanobanana-pro, klein. **Video:** veo, seedance-pro, wan, wan-pro, p-video, nova-reel. See /image/models for full list.",
        });

const GenerateImageRequestQueryParamsBaseSchema = z.object({
    // Image model params
    model: modelSchema(DEFAULT_IMAGE_MODEL),
    width: z.coerce.number().int().nonnegative().optional().default(1024).meta({
        description:
            "Width in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier.",
    }),
    height: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(1024)
        .meta({
            description:
                "Height in pixels. For images, exact pixels. For video models, used for aspect ratio; use `resolution` to select a resolution tier.",
        }),
    seed: z.coerce
        .number()
        .int()
        .min(-1)
        .max(MAX_SEED_VALUE)
        .optional()
        .default(0)
        .meta({
            description:
                "Seed for reproducible results. Supported by: flux, zimage, seedream, klein, seedance, nova-reel. Other models ignore this parameter.",
        }),
    safe: SafeSchema,
    quality: z
        .enum(QUALITIES as unknown as [string, ...string[]])
        .optional()
        .default("medium")
        .meta({
            description:
                "Image quality level. Supported by `gptimage`, `gptimage-large`, `gpt-image-2`, and `grok-imagine-image-2.0`.",
        }),
    image: z
        .string()
        .transform((value: string) => {
            if (!value) return undefined;
            // Support both pipe (|) and comma (,) separators
            // Prefer pipe separator if present, otherwise use comma
            return value.includes("|") ? value.split("|") : value.split(",");
        })
        .optional()
        .refine(
            (urls) =>
                !urls ||
                urls.every(
                    (url) =>
                        !url ||
                        url.startsWith("http://") ||
                        url.startsWith("https://"),
                ),
            {
                message:
                    "Invalid image URL. Put image= param last in your URL, or URL-encode it.",
            },
        )
        .meta({
            description:
                "Reference image URL(s) for image editing or video generation. Separate multiple URLs with `|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** `image[0]` = starting frame (I2V); `image[1]` = ending frame for first+last-frame interpolation. End-frame supported by `veo`, the `seedance-2.0` family, `seedance-2.5`, `wan-fast`, and `wan-pro`; other video models silently drop `image[1]`. See `video_capabilities` on `/image/models` or `/models` for per-model support.",
        }),
    transparent: z.coerce.boolean().optional().default(false).meta({
        description:
            "Generate image with transparent background. Only supported by `gptimage` and `gptimage-large`.",
    }),

    // Video-specific params
    resolution: z
        .enum(["1k", "2k", "480p", "720p", "768p", "1080p"])
        .optional()
        .meta({
            description:
                "Output resolution for image and video models that advertise `resolutions` in `/models`. The first advertised resolution is the default; requested tiers bill at their listed rate.",
        }),
    duration: z.coerce.number().int().min(1).max(120).optional().meta({
        description:
            "Video duration in seconds. Only applies to video models. `veo`: 4, 6, or 8s. `seedance-pro`: 2-10s. `seedance-2.0`: 4-15s; Mini: 4-10s; Fast: 4-5s. `seedance-2.5`: exactly 4s. `minimax-h3`: exactly 5s. `wan`: 2-15s. `nova-reel`: 6-120s (multiples of 6).",
    }),
    aspectRatio: z.string().optional().meta({
        description:
            "Video aspect ratio (`16:9` or `9:16`). Only applies to video models. If not set, determined by explicit width/height; `seedance-2.5` otherwise defaults to `16:9`. `minimax-h3` supports only `16:9`.",
    }),
    audio: z.coerce.boolean().optional().default(false).meta({
        description:
            "Generate audio for the video. Only applies to video models. `wan` and `minimax-h3` always generate audio regardless of this flag. For `veo`, set to `true` to enable audio.",
    }),
});

const validateDuration = (
    params: z.infer<typeof GenerateImageRequestQueryParamsBaseSchema>,
    ctx: z.RefinementCtx,
) => {
    if (
        params.duration !== undefined &&
        params.duration > 30 &&
        !NOVA_REEL_MODELS.has(params.model)
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["duration"],
            message:
                "Duration above 30 seconds is only supported by nova-reel.",
        });
    }
};

export const GenerateImageRequestQueryParamsSchema =
    GenerateImageRequestQueryParamsBaseSchema.superRefine(validateDuration);

export const GenerateVideoRequestQueryParamsSchema =
    GenerateImageRequestQueryParamsBaseSchema.extend({
        model: modelSchema("veo"),
    }).superRefine(validateDuration);

export type GenerateImageRequestQueryParams = z.infer<
    typeof GenerateImageRequestQueryParamsSchema
>;
