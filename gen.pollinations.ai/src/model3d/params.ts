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
    format: z.enum(["glb", "obj", "usdz", "fbx"]).catch("glb"),
    safe: z
        .union([z.string(), z.boolean()])
        .transform((value) => {
            if (typeof value === "boolean") return value;
            return value?.toString()?.toLowerCase?.() === "true";
        })
        .catch(false),
});

export type Model3dParams = z.infer<typeof Model3dParamsSchema>;
