import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/eleven-text-to-sound-v2";

export default {
    aliases: ["sfx", "sound-effects", "eleven-sound-effects", "eleven-sfx"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-06-22").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Sound Effects: $0.12/minute.
        completionAudioSeconds: 0.002,
    },
    title: "ElevenLabs Sound Effects",
    description: "Sound effects from a text description",
    inputModalities: ["text"],
    outputModalities: ["audio"],
} satisfies ModelDefinition;
