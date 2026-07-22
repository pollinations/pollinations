import { defineCostVariants } from "./cost-variants";
import type { BillingContext, ModelDefinition } from "./registry";

export const DEFAULT_3D_MODEL = "trellis-2" as const;

export type Model3dName = keyof typeof MODEL3D_SERVICES;

// completionImageTokens is reused here as a flat per-generation charge (not
// literal tokens) — same convention as image models — to avoid introducing a
// new UsageType, which would require new fields in
// shared/schemas/generation-event.ts and a Tinybird schema change.
export const MODEL3D_SERVICES = {
    "trellis-2": {
        aliases: ["trellis-2-low", "trellis-2-medium", "trellis-2-high"],
        aliasDefaults: {
            "trellis-2-low": { quality: "low" },
            "trellis-2-medium": { quality: "medium" },
            "trellis-2-high": { quality: "high" },
        },
        provider: "inferenceport",
        brand: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        flatRate: true,

        cost: {
            completionImageTokens: 0.24,
        },
        ...defineCostVariants(
            {
                low: {},
                medium: { completionImageTokens: 0.29 },
                high: { completionImageTokens: 0.35 },
            },
            ({ input }: BillingContext) => {
                const quality =
                    (input && typeof input === "object" && "quality" in input
                        ? (input as { quality?: string }).quality
                        : undefined) ?? "low";
                if (
                    quality !== "low" &&
                    quality !== "medium" &&
                    quality !== "high"
                ) {
                    throw new Error(
                        `Unsupported Trellis 2 quality: ${quality}`,
                    );
                }
                return quality;
            },
        ),
        title: "Trellis 2",
        description: "Turns a photo into a 3D model at configurable detail",
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
