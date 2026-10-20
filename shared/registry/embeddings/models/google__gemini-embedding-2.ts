import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-embedding-2";

export default {
    aliases: ["embedding", "gemini-2"],
    provider: "google",
    publisher: "Google",
    category: "embedding",
    addedDate: new Date("2026-05-08").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.2),
        promptImageTokens: perMillion(0.45),
        promptAudioTokens: perMillion(6.5),
        promptVideoTokens: perMillion(12),
    },
    title: "Gemini Embedding 2",
    description:
        "Turns text, images, audio and video into vectors for semantic search. 3072 dimensions, 8192 token limit.",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["embedding"],
    contextLength: 8192,
} satisfies ModelDefinition;
