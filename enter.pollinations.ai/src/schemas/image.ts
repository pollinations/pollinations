import { IMAGE_SERVICES } from "@/registry/image";
import { z } from "zod";

const QUALITIES = ["low", "medium", "high", "hd"] as const;
const MAX_SEED_VALUE = 1844674407370955;

export const GenerateImageRequestQueryParamsSchema = z.object({
    model: z.literal(Object.keys(IMAGE_SERVICES)).optional().default("flux"),
    width: z.coerce.number().int().nonnegative().optional().default(1024),
    height: z.coerce.number().int().nonnegative().optional().default(1024),
    seed: z.coerce
        .number()
        .int()
        .min(0)
        .max(MAX_SEED_VALUE)
        .optional()
        .default(42),
    enhance: z.coerce.boolean().optional().default(false),
    negative_prompt: z.coerce
        .string()
        .optional()
        .default("worst quality, blurry"),
    private: z.coerce.boolean().optional().default(false),
    nologo: z.coerce.boolean().optional().default(false),
    nofeed: z.coerce.boolean().optional().default(false),
    safe: z.coerce.boolean().optional().default(false),
    quality: z.literal(QUALITIES).optional().default("medium"),
    image: z
        .string()
        .transform((value: string) => {
            if (!value) return [];
            // Support both pipe (|) and comma (,) separators
            // Prefer pipe separator if present, otherwise use comma
            return value.includes("|") ? value.split("|") : value.split(",");
        })
        .optional()
        .default([]),
    transparent: z.coerce.boolean().optional().default(false),
    guidance_scale: z.coerce.number().optional(),
});

export type GenerateImageRequestQueryParams = z.infer<
    typeof GenerateImageRequestQueryParamsSchema
>;
