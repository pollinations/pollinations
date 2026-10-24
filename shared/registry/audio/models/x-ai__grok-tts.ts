import { XAI_TTS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "x-ai/grok-tts";

export default {
    aliases: ["grok-tts"],
    provider: "xai",
    publisher: "xAI",
    category: "audio",
    addedDate: new Date("2026-08-19").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // xAI REST text-to-speech: $15 per 1M input characters.
        completionAudioTokens: 15 / 1_000_000,
    },
    title: "Grok TTS",
    description:
        "Expressive multilingual speech across 28 built-in voices with inline style controls",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...XAI_TTS_VOICES],
    supportedEndpoints: ["/audio/{text}", "/v1/audio/speech"],
} satisfies ModelDefinition;
