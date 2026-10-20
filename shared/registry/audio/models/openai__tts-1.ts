import type { ModelDefinition } from "../../registry";
export const id = "openai/tts-1";

export default {
    // The bare "tts" alias points at the free default speech model.
    aliases: ["tts-1", "tts"],
    provider: "azure",
    publisher: "OpenAI",
    category: "audio",
    addedDate: new Date("2026-09-29").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    cost: { completionAudioTokens: 15 / 1_000_000 },
    title: "OpenAI TTS",
    description:
        "Low-latency speech synthesis with six voices and six output formats",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    supportedEndpoints: ["/audio/{text}", "/v1/audio/speech"],
} satisfies ModelDefinition;
