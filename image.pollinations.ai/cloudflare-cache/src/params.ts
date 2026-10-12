import { z } from "zod";

// The VM's query schema (image.pollinations.ai/src/params.ts) and model table
// (src/models.ts with the registry tiers), unchanged: zod is pinned to the
// VM's 4.4.3, whose output (key order, "undefined" negative_prompt) shows in
// EXIF, the feed and error JSON

export const MODELS = {
    sana: { enhance: true, maxSideLength: 768, tier: "seed" },
    kontext: { enhance: true, maxSideLength: 1024, tier: "nectar" },
    seedream: {
        enhance: false,
        maxSideLength: 4096,
        defaultSideLength: 1024,
        tier: "nectar",
    },
    nanobanana: {
        enhance: false,
        maxSideLength: 2048,
        defaultSideLength: 1024,
        tier: "nectar",
    },
} as const;

type ModelName = keyof typeof MODELS;

const allowedModels = Object.keys(MODELS) as ModelName[];
const validQualities = ["low", "medium", "high", "hd"] as const;

const sanitizedBoolean = z
    .union([z.string(), z.boolean()])
    .transform((value) => {
        if (typeof value === "boolean") return value;
        return value?.toString()?.toLowerCase?.() === "true";
    });

const sanitizedSeed = z.preprocess((v) => {
    const seed = String(v);
    return Number.isInteger(parseInt(seed)) ? parseInt(seed) : 42;
}, z.int().catch(42));

const sanitizedSideLength = z.preprocess((v) => {
    return Number.isInteger(parseInt(v as string))
        ? parseInt(v as string)
        : undefined;
}, z.int().optional());

function adjustImageSizeForModel(
    model: ModelName,
    width?: number,
    height?: number,
): { width: number; height: number } {
    const config: { maxSideLength: number; defaultSideLength?: number } =
        MODELS[model];
    const maxSideLength = config.maxSideLength;
    const defaultSideLength = config.defaultSideLength ?? maxSideLength;
    const maxPixels = maxSideLength * maxSideLength;

    let sanitizedWidth =
        width !== undefined && Number.isInteger(width)
            ? width
            : defaultSideLength;
    let sanitizedHeight =
        height !== undefined && Number.isInteger(height)
            ? height
            : defaultSideLength;

    // Keep the aspect ratio when the area exceeds maxPixels
    if (sanitizedWidth * sanitizedHeight > maxPixels) {
        const ratio = Math.sqrt(maxPixels / (sanitizedWidth * sanitizedHeight));
        sanitizedWidth = Math.floor(sanitizedWidth * ratio);
        sanitizedHeight = Math.floor(sanitizedHeight * ratio);
    }

    return { width: sanitizedWidth, height: sanitizedHeight };
}

export const ImageParamsSchema = z
    .object({
        width: sanitizedSideLength,
        height: sanitizedSideLength,
        seed: sanitizedSeed,
        model: z.preprocess((m) => {
            const model = String(m || "sana");
            return model === "flux" ||
                model === "z-image" ||
                model === "turbo" ||
                model === "zimage"
                ? "sana"
                : model;
        }, z.literal(allowedModels).catch("sana")),
        enhance: sanitizedBoolean.catch(false),
        // Parsed and echoed only: the logo is always added
        nologo: sanitizedBoolean.catch(false),
        negative_prompt: z.coerce.string().catch("worst quality, blurry"),
        nofeed: sanitizedBoolean.catch(false),
        safe: sanitizedBoolean.catch(false),
        private: sanitizedBoolean.catch(false).optional(),
        quality: z.literal(validQualities).catch("medium"),
        image: z
            .union([z.string(), z.null(), z.undefined()])
            .transform((value?: string | null) => {
                if (!value) return [];
                return value.includes("|")
                    ? value.split("|")
                    : value.split(",");
            })
            .catch([]),
        transparent: sanitizedBoolean.catch(false),
        guidance_scale: z.coerce.number().optional().catch(undefined),
    })
    .transform((data) => {
        const { width, height } = adjustImageSizeForModel(
            data.model,
            data.width,
            data.height,
        );
        const nofeed = data.nofeed || data.private || false;
        delete data.private;

        return { ...data, nofeed, width, height };
    });

export type ImageParams = z.infer<typeof ImageParamsSchema>;
