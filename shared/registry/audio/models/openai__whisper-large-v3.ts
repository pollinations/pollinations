import type { ModelDefinition } from "../../registry";
export const id = "openai/whisper-large-v3";

export default {
    aliases: ["whisper-1", "whisper-large-v3", "whisper"],
    provider: "ovhcloud",
    publisher: "OpenAI",
    category: "audio",
    addedDate: new Date("2026-02-08").getTime(),
    priceMultiplier: 1,
    paidOnly: false,
    cost: {
        // OVHcloud USD list price: $0.163/hour.
        promptAudioSeconds: 0.163 / 3600,
    },
    title: "Whisper Large V3",
    description: "Accurate, affordable speech-to-text transcription",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
