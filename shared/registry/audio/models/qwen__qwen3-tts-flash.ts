import type { ModelDefinition } from "../../registry";
export const id = "qwen/qwen3-tts-flash";

export default {
    aliases: ["qwen3-tts", "qwen3-tts-flash", "qwen-tts"],
    provider: "alibaba",
    publisher: "Qwen",
    category: "audio",
    addedDate: new Date("2026-04-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    perUserRpm: 60,
    cost: {
        // DashScope Qwen3-TTS-Flash: $0.10 per 10K characters
        completionAudioTokens: 0.01 / 1000,
    },
    title: "Qwen3-TTS Flash",
    description: "Fast multilingual text-to-speech at low cost",
    inputModalities: ["text"],
    outputModalities: ["audio"],
} satisfies ModelDefinition;
