import { DEFAULT_MODERATION_MODEL } from "@shared/registry/moderation.ts";
import { z } from "zod";

export const MODERATION_CATEGORIES = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "self-harm",
    "self-harm/instructions",
    "self-harm/intent",
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
    "illicit",
    "illicit/violent",
] as const;

export const MAX_MODERATION_BATCH_SIZE = 32;

export const CreateModerationRequestSchema = z
    .object({
        model: z.string().default(DEFAULT_MODERATION_MODEL).meta({
            description: "Moderation model to use",
            example: "qwen-safety",
        }),
        input: z
            .union([
                z.string(),
                z.array(z.string()).min(1).max(MAX_MODERATION_BATCH_SIZE),
            ])
            .meta({
                description: `Text to classify. Pass a string or an array of up to ${MAX_MODERATION_BATCH_SIZE} strings — each input gets its own moderation result.`,
                example: "I want to hurt myself",
            }),
    })
    .meta({ $id: "CreateModerationRequest" });

export const ModerationCategoriesSchema = z.object(
    Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [category, z.boolean()]),
    ) as Record<(typeof MODERATION_CATEGORIES)[number], z.ZodBoolean>,
);

export const ModerationCategoryScoresSchema = z.object(
    Object.fromEntries(
        MODERATION_CATEGORIES.map((category) => [category, z.number()]),
    ) as Record<(typeof MODERATION_CATEGORIES)[number], z.ZodNumber>,
);

export const ModerationResultSchema = z.object({
    flagged: z.boolean(),
    categories: ModerationCategoriesSchema,
    category_scores: ModerationCategoryScoresSchema,
});

export const CreateModerationResponseSchema = z
    .object({
        id: z.string(),
        model: z.string(),
        results: z.array(ModerationResultSchema),
    })
    .meta({ $id: "CreateModerationResponse" });

export type CreateModerationRequest = z.infer<
    typeof CreateModerationRequestSchema
>;
