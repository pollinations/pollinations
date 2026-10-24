import type { ModelDefinition } from "../../registry";
export const id = "recraft/recraft-v4.1-vector";

export default {
    aliases: [
        "recraft-vector",
        "recraft-svg",
        "recraft-v4.1-svg",
        "recraft-v4.1-vector",
    ],
    provider: "openrouter",
    publisher: "Recraft",
    category: "image",
    addedDate: new Date("2026-07-24").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.08 * 1.055, // fixed per output SVG
    },
    title: "Recraft V4.1 Vector",
    description: "Editable SVG generation and reference-guided vector design",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 1,
} satisfies ModelDefinition;
