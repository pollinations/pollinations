import { ELEVENLABS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-v3";

export default {
    aliases: ["text-to-speech", "eleven", "elevenlabs"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    addedDate: new Date("2026-02-07").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // ElevenLabs v3 via API: measured 0.60 credits/char (API-discounted
        // from the 1 cr/char UI rate) * $0.166/1k Scale credits = $0.10/1k chars
        // (matches elevenlabs.io/pricing/api).
        completionAudioTokens: 0.1 / 1000,
    },
    title: "ElevenLabs v3 TTS",
    description:
        "Expressive speech with emotion controls, audio tags, and character timestamps",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
    supportedEndpoints: [
        "/audio/{text}",
        "/v1/audio/speech",
        "/v1/audio/speech/with-timestamps",
    ],
} satisfies ModelDefinition;
