import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/voice-isolator";

export default {
    aliases: ["voice-isolator", "audio-cleanup", "eleven-voice-isolator"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-07-26").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Voice Isolator: $0.12 per input minute.
        promptAudioSeconds: 0.12 / 60,
    },
    title: "ElevenLabs Voice Isolator",
    description: "Removes background noise while preserving clear spoken audio",
    inputModalities: ["audio", "video"],
    outputModalities: ["audio"],
    supportedEndpoints: ["/v1/audio/voice-isolator"],
} satisfies ModelDefinition;
