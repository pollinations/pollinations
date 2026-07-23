import type { ModelDefinition } from "./registry";

export const DEFAULT_3D_MODEL = "trellis-2-low" as const;

export type Model3dName = keyof typeof MODEL3D_SERVICES;

// completionImageTokens is reused here as a flat per-generation charge (not
// literal tokens) — same convention as image models — to avoid introducing a
// new UsageType, which would require new fields in
// shared/schemas/generation-event.ts and a Tinybird schema change.
export const MODEL3D_SERVICES = {
    "trellis-2-low": {
        aliases: [],
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
        description:
            "Turns a photo into a 3D model — fastest option, lowest detail",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "trellis-2-medium": {
        aliases: [],
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
        description:
            "Turns a photo into a 3D model with balanced detail and cost",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "trellis-2-high": {
        aliases: [],
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
        description:
            "Turns a photo into a 3D model at maximum detail; the priciest tier",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "hyper3d-rodin": {
        aliases: ["rodin"],
        provider: "fal",
        brand: "Deemos",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true, // fal.ai-served — restrict to paid balance
        flatRate: true,

        cost: {
            completionImageTokens: 0.1, // per generation
        },
        title: "Hyper3D Rodin 2.5",
        description: "Textured 3D models from an image or a text prompt",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
} as const satisfies Record<string, ModelDefinition>;

export const getModel3dModelIds = (): string[] => Object.keys(MODEL3D_SERVICES);
