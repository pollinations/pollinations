import { MODEL3D_SERVICES } from "@shared/registry/model3d.ts";
import { z } from "zod";

const VALID_3D_MODELS = [
    ...Object.keys(MODEL3D_SERVICES),
    ...Object.values(MODEL3D_SERVICES).flatMap((service) => service.aliases),
] as const;

export const Model3dParamsSchema = z.object({
    model: z.enum(VALID_3D_MODELS as unknown as [string, ...string[]]),
    image: z
        .union([z.array(z.string()), z.string(), z.null(), z.undefined()])
        .transform((value?: string[] | string | null) => {
            if (!value) return [];
            if (Array.isArray(value)) return value;
            return value.includes("|") ? value.split("|") : value.split(",");
        })
        .catch([]),
    // Not passed to either provider unless it natively supports seeds (see
    // rodinModel.ts/trellis2Model.ts) — still accepted here so it becomes
    // part of the media-cache key, letting callers force a fresh generation
    // for the same prompt by varying the seed.
    seed: z.coerce.number().int().optional().catch(undefined),
    safe: z
        .union([z.string(), z.boolean()])
        .transform((value) => {
            if (typeof value === "boolean") return value;
            return value?.toString()?.toLowerCase?.() === "true";
        })
        .catch(false),
});

export type Model3dParams = z.infer<typeof Model3dParamsSchema>;
