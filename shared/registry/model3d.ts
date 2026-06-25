import type { ModelDefinition } from "./registry";

export const DEFAULT_3D_MODEL = "triposr" as const;

export type Model3dName = keyof typeof MODEL3D_SERVICES;
export type Model3dId = (typeof MODEL3D_SERVICES)[Model3dName]["modelId"];

// completionImageTokens is reused here as a flat per-generation charge (not
// literal tokens) — same convention as image models — to avoid introducing a
// new UsageType, which would require new fields in
// shared/schemas/generation-event.ts and a Tinybird schema change.
export const MODEL3D_SERVICES = {
    "triposr": {
        aliases: [],
        modelId: "triposr",
        provider: "inferenceport",
        fallbackProvider: "fal",
        brand: "Stability AI",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        cost: {
            completionImageTokens: 0.02, // per generation (inferenceport primary, confirmed by provider)
        },
        title: "TripoSR",
        description: "TripoSR - Fast image-to-3D model generation",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "sf3d": {
        aliases: [],
        modelId: "sf3d",
        provider: "inferenceport",
        fallbackProvider: "fal",
        brand: "Stability AI",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.02, // per generation (inferenceport primary, confirmed by provider)
        },
        title: "SF3D",
        description:
            "Stable Fast 3D - Rapid single-image to 3D model generation",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "asset-harvester": {
        aliases: [],
        modelId: "asset-harvester",
        provider: "inferenceport",
        brand: "inferenceport",
        category: "3d",
        addedDate: new Date("2026-06-25").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.07, // per generation (inferenceport-only, no fal.ai equivalent)
        },
        title: "Asset Harvester",
        description:
            "Asset Harvester - Image-to-3D mesh extraction, returns a PLY mesh",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "tripo3d-h3.1": {
        aliases: ["tripo3d"],
        modelId: "tripo3d-h3.1",
        provider: "fal",
        brand: "Tripo",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.1, // per generation, no-texture tier
        },
        title: "Tripo3D H3.1",
        description: "Tripo3D H3.1 - Text/image-to-3D, untextured mesh",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "trellis-2-low": {
        aliases: [],
        modelId: "trellis-2-low",
        provider: "inferenceport",
        fallbackProvider: "fal",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.24, // per generation, "low" resolution (inferenceport primary)
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
        fallbackProvider: "fal",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.29, // per generation, "medium" resolution (inferenceport primary)
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
        fallbackProvider: "fal",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.35, // per generation, "high" resolution (inferenceport primary)
        },
        title: "Trellis 2 (High)",
        description: "Trellis 2 - High-quality image-to-3D, high resolution",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "hunyuan3d-v3": {
        aliases: [],
        modelId: "hunyuan3d-v3",
        provider: "fal",
        brand: "Tencent",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 0.375, // per generation
        },
        title: "Hunyuan3D V3",
        description: "Hunyuan3D V3 - Text-to-3D model generation",
        inputModalities: ["text"],
        outputModalities: ["3d"],
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
        paidOnly: true,
        cost: {
            completionImageTokens: 0.4, // per generation
        },
        title: "Hyper3D Rodin",
        description: "Hyper3D Rodin - Image/text-to-3D with textures",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "hyper3d-rodin-highpack": {
        aliases: [],
        modelId: "hyper3d-rodin-highpack",
        provider: "fal",
        brand: "Deemos",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,
        paidOnly: true,
        cost: {
            completionImageTokens: 1.2, // per generation, 4K textures + high-poly
        },
        title: "Hyper3D Rodin HighPack",
        description: "Hyper3D Rodin HighPack - Image/text-to-3D, 4K textures",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
} as const satisfies Record<string, ModelDefinition<string>>;

export const getModel3dModelIds = (): string[] => Object.keys(MODEL3D_SERVICES);
