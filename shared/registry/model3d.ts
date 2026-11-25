import { defineCostVariants, matchResolution } from "./cost-variants";
import { mergeFallbacks } from "./merge-fallbacks";
import { MODEL3D_FALLBACKS } from "./model3d-fallbacks";
import type { ModelDefinition } from "./registry";

export const DEFAULT_3D_MODEL = "microsoft/trellis-2" as const;

export type Model3dName = keyof typeof MODEL3D_SERVICES;

// completionImageTokens is reused here as a flat per-generation charge (not
// literal tokens) — same convention as image models — to avoid introducing a
// new UsageType, which would require new fields in
// shared/schemas/generation-event.ts and a Tinybird schema change.
const MODEL3D_BASE_SERVICES = {
    "tripo3d/p2": {
        aliases: [],
        provider: "fal",
        publisher: "Tripo",
        category: "3d",
        addedDate: new Date("2026-09-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        alpha: true,
        flatRate: true,
        cost: { completionImageTokens: 1.1 },
        title: "Tripo P2",
        description:
            "Describe an object to create a 3D mesh with materials that catch and reflect light.",
        inputModalities: ["text"],
        outputModalities: ["3d"],
    },
    "microsoft/trellis-2": {
        aliases: [
            "trellis-2-low",
            "trellis-2-medium",
            "trellis-2-high",
            "trellis-2",
        ],
        provider: "inferenceport",
        publisher: "Microsoft",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        flatRate: true,

        cost: {
            completionImageTokens: 0.24,
        },
        ...defineCostVariants(
            {
                medium: { completionImageTokens: 0.29 },
                high: { completionImageTokens: 0.35 },
            },
            matchResolution("medium", "high"),
            {
                medium: {
                    label: "Medium resolution",
                    description: "Balanced output detail and generation cost.",
                },
                high: {
                    label: "High resolution",
                    description: "Maximum output detail.",
                },
            },
            "Low resolution",
            [
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "values": {
                        "": "Low",
                        "medium": "Medium",
                        "high": "High",
                    },
                },
            ],
        ),
        title: "Trellis 2",
        description:
            "Turn one image into a 3D model and choose how much detail to keep.",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
        resolutions: ["low", "medium", "high"],
    },
    "nvidia/asset-harvester": {
        aliases: [],
        publisher: "NVIDIA",
        provider: "inferenceport",
        category: "3d",
        addedDate: new Date("2026-09-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        flatRate: true,
        cost: {
            // Account config and completed-job charge verified 2026-10-24.
            completionImageTokens: 0.07,
        },
        title: "Asset Harvester",
        description:
            "Turn one image into a 3D Gaussian splat, a scene made of soft, overlapping points.",
        inputModalities: ["image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
    "hyper3d/rodin-2.5": {
        aliases: ["rodin", "hyper3d-rodin"],
        provider: "fal",
        publisher: "Hyper3D",
        category: "3d",
        addedDate: new Date("2026-06-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true, // fal.ai-served — restrict to paid balance
        flatRate: true,

        cost: {
            completionImageTokens: 0.1, // per generation
        },
        title: "Rodin Gen-2.5",
        description:
            "Create a textured 3D object from a written description or a reference image.",
        inputModalities: ["text", "image"],
        outputModalities: ["3d"],
        maxReferenceImages: 1,
    },
} as const satisfies Record<string, ModelDefinition>;

export const MODEL3D_SERVICES = mergeFallbacks(
    MODEL3D_BASE_SERVICES,
    MODEL3D_FALLBACKS,
);

export const getModel3dModelIds = (): string[] => Object.keys(MODEL3D_SERVICES);
