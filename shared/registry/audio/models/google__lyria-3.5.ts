import type { ModelDefinition } from "../../registry";
export const id = "google/lyria-3.5";

export default {
    aliases: [],
    provider: "google",
    publisher: "Google",
    category: "audio",
    addedDate: new Date("2026-09-26").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    flatRate: true,
    cost: {
        // Gemini Developer API bills $0.08 per generated song, including input.
        completionAudioTokens: 0.08,
    },
    title: "Lyria 3.5",
    description:
        "Full songs with vocals or instrumental arrangements; describe structure and approximate duration in the prompt",
    inputModalities: ["text"],
    outputModalities: ["audio"],
} satisfies ModelDefinition;
