import type { ModelDefinition } from "../../registry";
export const id = "bytedance/seedream-5.0-lite";

export default {
    aliases: ["seedream5"],
    provider: "replicate",
    publisher: "ByteDance",
    category: "image",
    addedDate: new Date("2026-02-27").getTime(),
    priceMultiplier: 1,
    perUserRpm: 60,
    paidOnly: true,
    cost: {
        completionImageTokens: 0.035, // per image
    },
    title: "Seedream 5.0 Lite",
    description:
        "Image generation that can search the web and reason about your prompt",
    inputModalities: ["text", "image"],
    outputModalities: ["image"],
    maxReferenceImages: 14, // Pollinations route cap from Replicate schema.
} satisfies ModelDefinition;
