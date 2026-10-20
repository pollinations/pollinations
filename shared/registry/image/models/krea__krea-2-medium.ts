import type { ModelDefinition } from "../../registry";
export const id = "krea/krea-2-medium";

export default {
    aliases: ["krea-2", "krea"],
    provider: "fal",
    publisher: "Krea",
    category: "image",
    addedDate: new Date("2026-08-01").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.03, // flat per text-to-image output
    },
    title: "Krea 2 Medium",
    description:
        "Style-rich generation with strong prompt adherence and clean typography",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
