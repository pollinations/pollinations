import type { ModelDefinition } from "./registry";

export const DEFAULT_3D_MODEL = "trellis-2-low" as const;

export type Model3dName = keyof typeof MODEL3D_SERVICES;
export type Model3dId = (typeof MODEL3D_SERVICES)[Model3dName]["modelId"];

// completionImageTokens is reused here as a flat per-generation charge (not
// literal tokens) — same convention as image models — to avoid introducing a
// new UsageType, which would require new fields in
// shared/schemas/generation-event.ts and a Tinybird schema change.
export const MODEL3D_SERVICES = {
    "trellis-2-low": {
        aliases: [],
        modelId: "trellis-2-low",
        provider: "inferenceport",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,

        cost: {
            completionImageTokens: 0.24, // per generation, "low" resolution
        },
        title: "Trellis 2 (Low)",
        description: "Trellis 2 - High-quality image-to-3D, low resolution",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "trellis-2-medium": {
        aliases: [],
        modelId: "trellis-2-medium",
        provider: "inferenceport",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,

        cost: {
            completionImageTokens: 0.29, // per generation, "medium" resolution
        },
        title: "Trellis 2 (Medium)",
        description: "Trellis 2 - High-quality image-to-3D, medium resolution",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "trellis-2-high": {
        aliases: [],
        modelId: "trellis-2-high",
        provider: "inferenceport",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,

        cost: {
            completionImageTokens: 0.35, // per generation, "high" resolution
        },
        title: "Trellis 2 (High)",
        description: "Trellis 2 - High-quality image-to-3D, high resolution",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "hyper3d-rodin": {
        aliases: ["rodin"],
        modelId: "hyper3d-rodin",
        provider: "fal",
        brand: "Deemos",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,

        cost: {
            completionImageTokens: 0.4, // per generation
        },
        title: "Hyper3D Rodin 2.5",
        description: "Hyper3D Rodin 2.5 - Image/text-to-3D with textures",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
} as const satisfies Record<string, ModelDefinition<string>>;

export const getModel3dModelIds = (): string[] => Object.keys(MODEL3D_SERVICES);
