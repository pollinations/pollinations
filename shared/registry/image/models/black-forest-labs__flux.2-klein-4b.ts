import type { ModelDefinition } from "../../registry";
export const id = "black-forest-labs/flux.2-klein-4b";

export default {
    aliases: ["flux-klein", "klein"],
    provider: "vast",
    publisher: "Black Forest Labs",
    category: "image",
    addedDate: new Date("2026-01-17").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    perUserRpm: 60,
    cost: {
        completionImageTokens: 0.005,
    },
    title: "FLUX.2 Klein 4B",
    description: "Fast image generation and editing up to 2.4 megapixels",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 10, // Pollinations self-hosted route cap.
} satisfies ModelDefinition;
