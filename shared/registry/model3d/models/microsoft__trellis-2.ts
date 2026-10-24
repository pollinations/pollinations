import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "microsoft/trellis-2";

export default {
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
    description: "Image-to-3D generation with selectable output detail",
    inputModalities: ["image"],
    outputModalities: ["3d"],
    maxReferenceImages: 1,
    resolutions: ["low", "medium", "high"],
} satisfies ModelDefinition;
