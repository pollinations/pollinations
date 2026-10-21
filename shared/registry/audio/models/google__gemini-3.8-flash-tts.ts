import { GEMINI_TTS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "google/gemini-3.8-flash-tts";

export default {
    aliases: [],
    provider: "google",
    publisher: "Google",
    category: "audio",
    addedDate: new Date("2026-09-24").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Gemini Developer API standard pricing through 2026-12-31.
        // https://ai.google.dev/gemini-api/docs/pricing
        promptTextTokens: 0.5 / 1_000_000,
        completionAudioTokens: 9 / 1_000_000,
    },
    priceUnits: { completionAudioTokens: { unit: "token" } },
    title: "Gemini 3.8 Flash TTS",
    description:
        "Expressive, style-steerable speech across 30 voices for creative narration",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...GEMINI_TTS_VOICES],
} satisfies ModelDefinition;
