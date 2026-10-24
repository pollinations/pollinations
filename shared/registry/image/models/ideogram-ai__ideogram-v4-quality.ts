import type { ModelDefinition } from "../../registry";
export const id = "ideogram-ai/ideogram-v4-quality";

export default {
    aliases: ["ideogram-v4-quality"],
    provider: "replicate",
    publisher: "Ideogram",
    category: "image",
    addedDate: new Date("2026-06-15").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.1, // flat per image — ideogram-ai/ideogram-v4-quality
    },
    title: "Ideogram 4.0 Quality",
    description:
        "Highest-fidelity images with spot-on typography; slower to generate",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
