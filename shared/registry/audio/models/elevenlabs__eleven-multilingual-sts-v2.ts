import { ELEVENLABS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-multilingual-sts-v2";

export default {
    aliases: ["voice-changer", "speech-to-speech", "eleven-voice-changer"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-07-26").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Voice Changer: $0.12 per input minute.
        promptAudioSeconds: 0.12 / 60,
    },
    title: "ElevenLabs Voice Changer",
    description:
        "Preserves delivery and emotion while transforming speaker identity",
    inputModalities: ["audio"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
    supportedEndpoints: ["/v1/audio/voice-changer"],
} satisfies ModelDefinition;
