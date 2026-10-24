import type { ModelDefinition } from "../../registry";
export const id = "google/lyria-3-clip-preview";

export default {
    aliases: ["lyria", "lyria-3", "lyria-3-clip"],
    provider: "google",
    publisher: "Google",
    category: "audio",
    addedDate: new Date("2026-07-24").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // Vertex bills a fixed $0.04 for each 30-second generated clip.
        completionAudioTokens: 0.04,
    },
    flatRate: true,
    title: "Lyria 3 Clip Preview",
    description:
        "30-second music with vocals, lyrics, or instrumental arrangements",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    allowedDurations: [30],
} satisfies ModelDefinition;
