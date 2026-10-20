import { defineCostVariants, matchResolution } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "bytedance/seedream-5.0-flash";

export default {
    aliases: [],
    provider: "openrouter",
    publisher: "ByteDance",
    category: "image",
    addedDate: new Date("2026-10-02").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // OpenRouter Seed endpoint, verified 2026-10-05: a flat $0.018 per
        // image at both 1K and 2K, plus the 5.5% credit fee.
        completionImageTokens: 0.018 * 1.055, // per image
    },
    ...defineCostVariants(
        {
            "2k": { completionImageTokens: 0.018 * 1.055 },
        },
        matchResolution("2k"),
        {
            "2k": {
                label: "2K",
                description:
                    "Applies when the requested image resolution is 2K.",
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
    resolutions: ["1k", "2k"],
    title: "Seedream 5.0 Flash",
    description:
        "Image generation and editing at 1K or 2K with up to ten references",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10,
} satisfies ModelDefinition;
