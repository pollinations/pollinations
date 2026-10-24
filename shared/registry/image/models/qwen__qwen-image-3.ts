import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "qwen/qwen-image-3";

export default {
    aliases: ["qwen-image-3"],
    provider: "alibaba",
    publisher: "Qwen",
    category: "image",
    addedDate: new Date("2026-07-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptImageTokens: 0.003, // per reference image ingested
        completionImageTokens: 0.04, // per image up to 2,250,000 pixels
    },
    ...defineCostVariants(
        {
            "2k": {
                promptImageTokens: 0.003,
                completionImageTokens: 0.075,
            },
        },
        ({ input }) =>
            // DashScope bills 2K above 2,250,000 output pixels.
            (input?.megapixels ?? 0) > 2.25 ? "2k" : undefined,
        {
            "2k": {
                label: "2K",
                description:
                    "Applies when the requested output exceeds 2,250,000 total pixels (about 1500×1500).",
            },
        },
        "1K",
        [
            {
                "key": "resolution",
                "label": "Resolution",
                "values": {
                    "": "1K",
                    "2k": "2K",
                },
            },
        ],
    ),
    title: "Qwen Image 3",
    description:
        "Creates and edits detailed images with crisp multilingual text and complex layouts",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 3,
} satisfies ModelDefinition;
