import type { ModelDefinition } from "../../registry";
export const id = "google/gemini-3.5-transcribe";

export default {
    aliases: [],
    provider: "google",
    publisher: "Google",
    category: "audio",
    addedDate: new Date("2026-09-26").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Vertex global: published audio-input and text-output rates.
        promptAudioTokens: 2 / 1_000_000,
        completionTextTokens: 12 / 1_000_000,
        // Vertex reports extra text usage with timestamps; no input-text
        // rate is published. Preserve this usage separately from audio.
        promptTextTokens: 0,
    },
    title: "Gemini 3.5 Transcribe",
    description:
        "Speech recognition with word timestamps and speaker labels for up to eight speakers",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
