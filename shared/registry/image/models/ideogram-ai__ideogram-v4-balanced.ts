import type { ModelDefinition } from "../../registry";
export const id = "ideogram-ai/ideogram-v4-balanced";

export default {
    aliases: ["ideogram-v4-balanced"],
    provider: "replicate",
    publisher: "Ideogram",
    category: "image",
    addedDate: new Date("2026-06-15").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.06, // flat per image — ideogram-ai/ideogram-v4-balanced
    },
    title: "Ideogram 4.0 Balanced",
    description: "Balanced speed and quality with accurate text rendering",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
