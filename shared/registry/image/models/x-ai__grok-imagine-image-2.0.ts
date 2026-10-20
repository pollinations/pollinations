import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "x-ai/grok-imagine-image-2.0";

export default {
    aliases: ["grok-imagine-image-2.0"],
    provider: "openrouter",
    publisher: "xAI",
    category: "image",
    addedDate: new Date("2026-08-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // OpenRouter x-ai/grok-imagine-image-2.0 pricing, verified 2026-08-14.
    cost: {
        promptImageTokens: 0.01 * 1.055,
        completionImageTokens: 0.06 * 1.055, // medium, 1K
    },
    ...defineCostVariants(
        {
            low_1k: {
                promptImageTokens: 0.01 * 1.055,
                completionImageTokens: 0.04 * 1.055,
            },
            low_2k: {
                promptImageTokens: 0.01 * 1.055,
                completionImageTokens: 0.06 * 1.055,
            },
            medium_2k: {
                promptImageTokens: 0.01 * 1.055,
                completionImageTokens: 0.08 * 1.055,
            },
        },
        ({ input }) => {
            if (input?.quality === "low") {
                return input.resolution === "2k" ? "low_2k" : "low_1k";
            }
            return input?.resolution === "2k" ? "medium_2k" : undefined;
        },
        {
            low_1k: {
                label: "Low · 1K",
                description: "Applies to low-quality 1K requests.",
            },
            low_2k: {
                label: "Low · 2K",
                description: "Applies to low-quality 2K requests.",
            },
            medium_2k: {
                label: "Medium · 2K",
                description: "Applies to medium-quality 2K requests.",
            },
        },
        "Medium · 1K",
        [
            {
                "key": "quality",
                "label": "Quality",
                "values": {
                    "": "Medium",
                    "low_1k": "Low",
                    "low_2k": "Low",
                    "medium_2k": "Medium",
                },
            },
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "1K",
                    "low_1k": "1K",
                    "low_2k": "2K",
                    "medium_2k": "2K",
                },
            },
        ],
    ),
    resolutions: ["1k", "2k"],
    title: "Grok Imagine Image 2.0",
    description:
        "Creates and edits high-detail images at 1K or 2K with up to three references",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 3,
} satisfies ModelDefinition;
