import type { ModelDefinition } from "../../registry";
export const id = "stability-ai/stable-audio-3";

export default {
    // Distinct from stable-audio-3-medium (fal): this is the larger
    // API-only model served by Stability's direct API. Keep aliases
    // non-overlapping with the medium entry.
    aliases: ["stable-audio-large", "stable-audio-3-large", "stable-audio-3"],
    provider: "stability",
    publisher: "Stability AI",
    category: "audio",
    addedDate: new Date("2026-06-23").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    flatRate: true,
    cost: {
        // Stability Stable Audio 3.0 via the direct API: flat 26 credits/
        // generation (Stable Audio 2.5 was 20); credits are $0.01 each → $0.26.
        // Same fee for text-to-audio and audio-to-audio, so no audio-input
        // surcharge — the handler bills one flat completion audio unit.
        completionAudioTokens: 0.26,
    },
    title: "Stable Audio 3 Large",
    description:
        "Highest-quality long-form stereo music generation; priced per generation",
    inputModalities: ["text", "audio"],
    outputModalities: ["audio"],
    minDuration: 1,
    maxDuration: 380,
} satisfies ModelDefinition;
