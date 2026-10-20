import type { ModelDefinition } from "../../registry";
export const id = "recraft/recraft-v4.1-flash";

export default {
    aliases: [],
    provider: "openrouter",
    publisher: "Recraft",
    category: "image",
    addedDate: new Date("2026-09-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // OpenRouter bills 4,175 image tokens per image (same convention
        // as Recraft Vector): $0.007 fixed per output image, verified
        // 2026-09-23, plus the mandatory 5.5% OpenRouter credit fee.
        completionImageTokens: 0.007 * 1.055,
    },
    title: "Recraft V4.1 Flash",
    description: "Fast, low-cost raster image generation from text",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
