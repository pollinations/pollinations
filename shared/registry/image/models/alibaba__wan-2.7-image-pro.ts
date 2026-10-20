import type { ModelDefinition } from "../../registry";
export const id = "alibaba/wan-2.7-image-pro";

export default {
    aliases: ["wan2.7-image-pro", "wan-img-pro", "wan-image-pro"],
    provider: "replicate",
    publisher: "Alibaba",
    category: "image",
    addedDate: new Date("2026-04-02").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    // Moved off Alibaba DashScope ($0.075) to Replicate wan-2.7-image-pro,
    // which prices Pro identically to standard ($0.03/img).
    cost: {
        completionImageTokens: 0.03, // per image
    },
    title: "Wan 2.7 Image Pro",
    description:
        "Detailed 4K image generation and editing with a thinking mode",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 9, // Pollinations route cap.
} satisfies ModelDefinition;
