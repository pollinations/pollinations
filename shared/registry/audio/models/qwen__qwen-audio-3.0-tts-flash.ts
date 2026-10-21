import { QWEN_AUDIO_TTS_VOICES } from "../../audio/constants.ts";
import type { ModelDefinition } from "../../registry";

export const id = "qwen/qwen-audio-3.0-tts-flash";

export default {
    // Replaces Qwen3-TTS Instruct Flash, which Alibaba retires on 2026-10-10 (notice 2009).
    aliases: [
        "qwen/qwen3-tts-instruct-flash",
        "qwen3-tts-instruct",
        "qwen3-tts-instruct-flash",
        "qwen-tts-instruct",
    ],
    provider: "alibaba",
    publisher: "Qwen",
    category: "audio",
    addedDate: new Date("2026-10-08").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // DashScope Singapore: $0.15 per 10K characters
        completionAudioTokens: 0.015 / 1000,
    },
    title: "Qwen-Audio 3.0 TTS Flash",
    description:
        "Low-latency speech you can direct with emotion, tone and dialect instructions",
    inputModalities: ["text"],
    outputModalities: ["audio"],
    voices: [...QWEN_AUDIO_TTS_VOICES],
} satisfies ModelDefinition;
