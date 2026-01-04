import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import { z } from "zod";

const QUALITIES = ["low", "medium", "high", "hd"] as const;
const MAX_SEED_VALUE = 1844674407370955;

// Build list of valid model names: service IDs + all aliases
const VALID_IMAGE_MODELS = [
    ...Object.keys(IMAGE_SERVICES),
    ...Object.values(IMAGE_SERVICES).flatMap((service) => service.aliases),
] as const;

export const GenerateImageRequestQueryParamsSchema = z.object({
    // Image model params
    model: z
        .literal(VALID_IMAGE_MODELS)
        .optional()
        .default(DEFAULT_IMAGE_MODEL)
        .meta({
            description:
                "AI model. Image: zimage, turbo, gptimage, kontext, seedream, seedream-pro, nanobanana. Video: veo, seedance, seedance-pro",
        }),
    width: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(1024)
        .meta({ description: "Image width in pixels" }),
    height: z.coerce
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(1024)
        .meta({ description: "Image height in pixels" }),
    seed: z.coerce
        .number()
        .int()
        .min(-1)
        .max(MAX_SEED_VALUE)
        .optional()
        .default(0)
        .meta({
            description:
                "Random seed for reproducible results. Use -1 for random.",
        }),
    enhance: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Let AI improve your prompt for better results" }),
    negative_prompt: z.coerce
        .string()
        .optional()
        .default("worst quality, blurry")
        .meta({ description: "What to avoid in the generated image" }),
    private: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Hide image from public feeds" }),
    nologo: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Remove Pollinations watermark" }),
    nofeed: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Don't add to public feed" }),
    safe: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Enable safety content filters" }),
    quality: z
        .literal(QUALITIES)
        .optional()
        .default("medium")
        .meta({ description: "Image quality level" }),
    image: z
        .string()
        .transform((value: string) => {
            if (!value) return [];
            // Support both pipe (|) and comma (,) separators
            // Prefer pipe separator if present, otherwise use comma
            return value.includes("|") ? value.split("|") : value.split(",");
        })
        .optional()
        .default([])
        .refine(
            (urls) =>
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
                "Reference image URL(s). Comma/pipe separated for multiple. For veo: image[0]=first frame, image[1]=last frame (interpolation)",
        }),
    transparent: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Generate with transparent background" }),
    guidance_scale: z.coerce
        .number()
        .optional()
        .meta({ description: "How closely to follow the prompt (1-20)" }),

    // Video-specific params (for veo/seedance models)
    duration: z.coerce.number().int().optional().meta({
        description:
            "Video duration in seconds. veo: 4, 6, or 8. seedance: 2-10",
    }),
    aspectRatio: z
        .string()
        .optional()
        .meta({ description: "Video aspect ratio: 16:9 or 9:16" }),
    audio: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Enable audio generation for video (veo only)" }),
});

export type GenerateImageRequestQueryParams = z.infer<
    typeof GenerateImageRequestQueryParamsSchema
>;
