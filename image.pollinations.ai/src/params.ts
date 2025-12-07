import { z } from "zod";
import { MODELS } from "./models.js";
import Debug from "debug";

const log = Debug("pollinations:image.params");

type ModelName = keyof typeof MODELS;

const allowedModels = Object.keys(MODELS) as Array<keyof typeof MODELS>;
const validQualities = ["low", "medium", "high", "hd"] as const;
const maxSeedValue = 1844674407370955;

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
    const defaultSideLength = MODELS[model].defaultSideLength ?? 1024;

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
        enhance: sanitizedBoolean.catch(false),
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
                // Support both pipe (|) and comma (,) separators
                // Prefer pipe separator if present, otherwise use comma
                return value.includes("|")
                    ? value.split("|")
                    : value.split(",");
            })
            .catch([]),
        transparent: sanitizedBoolean.catch(false),
        guidance_scale: z.coerce.number().optional().catch(undefined),
        // Video-specific parameters - pass through to backend, let provider validate
        duration: z.coerce.number().optional(),
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
        audio: sanitizedBoolean.catch(false), // generateAudio defaults to false (can enable later)
    })
    .transform((data) => {
        // adjust width and height to fit the selected model
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
