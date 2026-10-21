import { ELEVENLABS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "elevenlabs/eleven-v4";

export default {
    aliases: [],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "audio",
    addedDate: new Date("2026-10-06").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // https://elevenlabs.io/pricing/api — regular rate after the launch offer.
        completionAudioTokens: 0.08 / 1000,
    },
    title: "ElevenLabs v4",
    description:
        "Expressive speech in 90+ languages with audio tags and character timestamps",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ELEVENLABS_VOICES as string[],
    supportedEndpoints: [
        "/audio/{text}",
        "/v1/audio/speech",
        "/v1/audio/speech/with-timestamps",
    ],
} satisfies ModelDefinition;
