import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/music-v2.5";

export default {
    aliases: [],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    addedDate: new Date("2026-09-11").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // ElevenLabs Music v2.5: reference ingestion and generated output
        // are each billed at $0.15/minute.
        promptAudioSeconds: 0.0025,
        completionAudioSeconds: 0.0025,
    },
    title: "ElevenLabs Music v2.5",
    description:
        "Richer, better prompt-following music from text or a reference track",
    inputModalities: ["text", "audio"],
    outputModalities: ["audio"],
    minDuration: 3,
    maxDuration: 300,
} satisfies ModelDefinition;
