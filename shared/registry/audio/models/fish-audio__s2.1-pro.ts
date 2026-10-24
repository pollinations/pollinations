import type { ModelDefinition } from "../../registry";
export const id = "fish-audio/s2.1-pro";

export default {
    aliases: ["fish-audio-s2.1-pro"],
    provider: "openrouter",
    publisher: "Fish Audio",
    category: "audio",
    addedDate: new Date("2026-08-19").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter, verified 2026-08-19: $15 per 1M UTF-8 input bytes.
        completionAudioTokens: (15 / 1_000_000) * 1.055,
    },
    priceUnits: { completionAudioTokens: { unit: "byte" } },
    title: "Fish Audio S2.1 Pro",
    description:
        "Multilingual expressive speech with natural-language emotion and delivery control",
    inputModalities: ["text"],
    outputModalities: ["audio"],
} satisfies ModelDefinition;
