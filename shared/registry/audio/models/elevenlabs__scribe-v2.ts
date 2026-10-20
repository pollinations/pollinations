import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/scribe-v2";

export default {
    aliases: ["scribe_v2", "scribe-v2", "scribe"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    addedDate: new Date("2026-02-13").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Scale plan: Scribe batch $0.22/hour
        promptAudioSeconds: 0.22 / 3600,
    },
    title: "Scribe v2",
    description: "Transcription in 90+ languages with speaker labels",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
