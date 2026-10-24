import type { ModelDefinition } from "../../registry";
export const id = "prunaai/p-image";

export default {
    aliases: ["pruna-image", "pruna", "p-image"],
    provider: "deepinfra",
    publisher: "Pruna",
    category: "image",
    addedDate: new Date("2026-03-14").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.005, // per image
    },
    title: "Pruna p-image",
    description: "Cheap, speedy text-to-image for rapid iteration",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
