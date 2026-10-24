import type { ModelDefinition } from "../../registry";
export const id = "prunaai/p-image-edit";

export default {
    aliases: ["pruna-edit", "pruna-image-edit", "p-image-edit"],
    provider: "deepinfra",
    publisher: "Pruna",
    category: "image",
    addedDate: new Date("2026-03-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.01, // per image
    },
    title: "Pruna p-image-edit",
    description: "Fast instruction-based photo editing",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 5, // Pollinations route cap.
} satisfies ModelDefinition;
