import { ELEVENLABS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-multilingual-v2";

export default {
    aliases: [
        "multilingual-v2",
        "eleven-v2",
        "tts-multilingual",
        "eleven-multilingual-v2",
    ],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    paidOnly: true,
    addedDate: new Date("2026-06-22").getTime(),
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Multilingual v2 via API: measured 0.60 credits/char
        // (API-discounted from the 1 cr/char UI rate) * $0.166/1k Scale credits
        // = $0.10/1k chars (matches elevenlabs.io/pricing/api).
        completionAudioTokens: 0.1 / 1000,
    },
    title: "ElevenLabs Multilingual v2",
    description:
        "Emotionally rich speech in 29 languages with character timestamps",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
    supportedEndpoints: [
        "/audio/{text}",
        "/v1/audio/speech",
        "/v1/audio/speech/with-timestamps",
    ],
} satisfies ModelDefinition;
