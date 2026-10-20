import { KOKORO_VOICES } from "../../audio.ts";
import type { ModelDefinition } from "../../registry";

export const id = "hexgrad/kokoro-82m";

export default {
    aliases: ["kokoro-82m", "kokoro-tts", "hexgrad-kokoro-82m", "kokoro"],
    provider: "deepinfra",
    publisher: "Hexgrad",
    category: "audio",
    addedDate: new Date("2026-07-31").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // DeepInfra bills hexgrad/Kokoro-82M at $0.99 per 1M input characters.
        completionAudioTokens: 0.99 / 1_000_000,
    },
    title: "Kokoro 82M",
    description:
        "Lightweight multilingual speech across 54 voices and eight languages",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...KOKORO_VOICES],
} satisfies ModelDefinition;
