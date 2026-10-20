import { ELEVENLABS_VOICES } from "../../audio.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-v3:dialogue";

export default {
    aliases: ["eleven-dialogue", "dialogue", "text-to-dialogue"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-07-26").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Text to Dialogue uses the v3 TTS character rate.
        completionAudioTokens: 0.1 / 1000,
    },
    title: "ElevenLabs Text to Dialogue",
    description:
        "Multi-speaker conversations with expressive voices and audio cues",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
} satisfies ModelDefinition;
