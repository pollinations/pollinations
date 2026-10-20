import type { ModelDefinition } from "../../registry";
export const id = "lykon/dreamshaper-8-lcm";

export default {
    // "sana" is kept as an alias so existing callers and the legacy image
    // proxy worker keep working unchanged.
    aliases: ["sana", "dreamshaper"],
    provider: "vast",
    publisher: "Lykon",
    category: "image",
    addedDate: new Date("2026-07-30").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    perUserRpm: 300,
    cost: {
        completionImageTokens: 0.0001, // per image
    },
    title: "DreamShaper 8 LCM",
    description:
        "Near-instant images at rock-bottom cost; simpler detail than premium models",
    inputModalities: ["text"],
    outputModalities: ["image"],
} satisfies ModelDefinition;
