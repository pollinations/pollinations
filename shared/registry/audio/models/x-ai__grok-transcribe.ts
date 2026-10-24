import type { ModelDefinition } from "../../registry";
export const id = "x-ai/grok-transcribe";

export default {
    aliases: ["grok-transcribe"],
    provider: "xai",
    publisher: "xAI",
    category: "audio",
    addedDate: new Date("2026-08-07").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // xAI REST speech-to-text: $0.10/hour.
        promptAudioSeconds: 0.1 / 3600,
    },
    title: "Grok Transcribe",
    description:
        "Fast multilingual speech recognition with word timestamps, speaker labels, and text formatting",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
