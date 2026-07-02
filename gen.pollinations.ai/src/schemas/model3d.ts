import {
    DEFAULT_3D_MODEL,
    MODEL3D_SERVICES,
} from "@shared/registry/model3d.ts";
import { SafeSchema } from "@shared/schemas/safety.ts";
import { z } from "zod";

const VALID_3D_MODELS = [
    ...Object.keys(MODEL3D_SERVICES),
    ...Object.values(MODEL3D_SERVICES).flatMap((service) => service.aliases),
] as const;

export const Generate3dRequestQueryParamsSchema = z.object({
    model: z
        .preprocess(
            (val) => (val === "" ? undefined : val),
            z
                .enum(VALID_3D_MODELS as unknown as [string, ...string[]])
                .optional()
                .default(DEFAULT_3D_MODEL),
        )
        .meta({
            description:
                "Model to use. See /3d/models for the full list and per-model input requirements.",
        }),
    image: z
        .string()
        .transform((value: string) => {
            if (!value) return undefined;
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
                "Reference image URL(s) for image-to-3D generation. Separate multiple URLs with `|` or `,`. Required for image-only models (e.g. `trellis`, `triposr`, `sf3d`).",
        }),
    seed: z.coerce.number().int().optional().meta({
        description:
            "Seed for varied generations. Passed through to models that support it (`hyper3d-rodin`); otherwise only affects the media-cache key, so a new seed forces a fresh generation for the same prompt/image.",
    }),
    safe: SafeSchema,
});

export type Generate3dRequestQueryParams = z.infer<
    typeof Generate3dRequestQueryParamsSchema
>;
