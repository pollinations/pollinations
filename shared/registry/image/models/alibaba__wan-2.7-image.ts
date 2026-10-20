import type { ModelDefinition } from "../../registry";
export const id = "alibaba/wan-2.7-image";

export default {
    aliases: ["wan2.7-image", "wan-img", "wan-image"],
    provider: "alibaba",
    publisher: "Alibaba",
    category: "image",
    addedDate: new Date("2026-04-02").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // Alibaba Singapore: $0.03 per generated or edited image.
    cost: {
        completionImageTokens: 0.03, // per image
    },
    title: "Wan 2.7 Image",
    description:
        "Text-to-image and instruction-based editing up to 2K resolution",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 9, // Pollinations route cap.
} satisfies ModelDefinition;
