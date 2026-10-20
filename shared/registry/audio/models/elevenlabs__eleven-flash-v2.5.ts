import { ELEVENLABS_VOICES } from "../../audio.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-flash-v2.5";

export default {
    aliases: ["tts-flash", "eleven-flash", "flash", "elevenflash"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-05-14").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Flash v2.5 via API: measured 0.30 credits/char
        // (API-discounted from the 0.5 cr/char UI rate) * $0.166/1k Scale
        // credits = $0.05/1k chars (matches elevenlabs.io/pricing/api).
        completionAudioTokens: 0.05 / 1000,
    },
    title: "ElevenLabs Flash v2.5",
    description: "Low-latency speech in 32 languages with character timestamps",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
    supportedEndpoints: [
        "/audio/{text}",
        "/v1/audio/speech",
        "/v1/audio/speech/with-timestamps",
    ],
} satisfies ModelDefinition;
