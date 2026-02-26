import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import { z } from "zod";

const QUALITIES = ["low", "medium", "high", "hd"] as const;
// Maximum seed value - use INT32_MAX for compatibility with strict providers like Vertex AI
const MAX_SEED_VALUE = 2147483647; // INT32_MAX (2^31 - 1)

// Build list of valid model names: service IDs + all aliases
const VALID_IMAGE_MODELS = [
    ...Object.keys(IMAGE_SERVICES),
    ...Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
] as const;

export const GenerateImageRequestQueryParamsSchema = z.object({
    // Image model params
    model: z
        .enum(VALID_IMAGE_MODELS as unknown as [string, ...string[]])
        .optional()
        .default(DEFAULT_IMAGE_MODEL)
        .meta({
            description:
                "Model to use. **Image:** flux, zimage, gptimage, kontext, seedream, seedream-pro, nanobanana, nanobanana-pro, klein, klein-large, imagen-4, grok-imagine. **Video:** veo, seedance, seedance-pro, wan, ltx-2, grok-video. See /image/models for full list.",
        }),
    width: z.coerce.number().int().nonnegative().optional().default(1024).meta({
        description:
            "Width in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p).",
    }),
    height: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(1024)
        .meta({
            description:
                "Height in pixels. For images, exact pixels. For video models, mapped to nearest resolution tier (480p/720p/1080p).",
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
                "Seed for reproducible results. Use -1 for random. Supported by: flux, zimage, seedream, klein, seedance. Other models ignore this parameter.",
        }),
    enhance: z.coerce.boolean().optional().default(false).meta({
        description:
            "Let AI improve your prompt for better results. Applied during prompt processing.",
    }),
    negative_prompt: z.coerce
        .string()
        .optional()
        .default("worst quality, blurry")
        .meta({
            description:
                "What to avoid in the generated image. Only supported by `flux` and `zimage` — other models ignore this.",
        }),
    safe: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Enable safety content filters" }),
    quality: z
        .enum(QUALITIES as unknown as [string, ...string[]])
        .optional()
        .default("medium")
        .meta({
            description:
                "Image quality level. Only supported by `gptimage` and `gptimage-large`.",
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
                "Reference image URL(s) for image editing or video generation. Separate multiple URLs with `|` or `,`. **Image models:** Used for editing/style reference (kontext, gptimage, seedream, klein, nanobanana). **Video models:** First image = starting frame; second image = ending frame for interpolation (veo only).",
        }),
    transparent: z.coerce.boolean().optional().default(false).meta({
        description:
            "Generate image with transparent background. Only supported by `gptimage` and `gptimage-large`.",
    }),

    // Video-specific params
    duration: z.coerce.number().int().min(1).max(10).optional().meta({
        description:
            "Video duration in seconds. Only applies to video models. `veo`: 4, 6, or 8s. `seedance`: 2-10s. `wan`: 2-15s. `ltx-2`: up to ~10s.",
    }),
    aspectRatio: z.string().optional().meta({
        description:
            "Video aspect ratio (`16:9` or `9:16`). Only applies to video models. If not set, determined by width/height.",
    }),
    audio: z.coerce.boolean().optional().default(false).meta({
        description:
            "Generate audio for the video. Only applies to video models. Note: `wan` and `ltx-2` generate audio regardless of this flag. For `veo`, set to `true` to enable audio.",
    }),
});

export type GenerateImageRequestQueryParams = z.infer<
    typeof GenerateImageRequestQueryParamsSchema
>;
