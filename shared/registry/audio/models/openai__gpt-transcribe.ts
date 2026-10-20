import type { ModelDefinition } from "../../registry";
export const id = "openai/gpt-transcribe";

export default {
    // gpt-4o-transcribe is the name OpenAI clients send by default.
    aliases: ["gpt-transcribe", "gpt-4o-transcribe"],
    provider: "azure",
    publisher: "OpenAI",
    category: "audio",
    addedDate: new Date("2026-08-19").getTime(),
    // Provider retires this route on 2028-02-01.
    paidOnly: false,
    priceMultiplier: 0.75,
    cost: {
        // Provisional OpenAI list price: $0.0045 per input minute. Azure's
        // exact meter was not yet visible when this route launched.
        promptAudioSeconds: 0.0045 / 60,
    },
    title: "GPT Transcribe",
    description:
        "Fast multilingual speech recognition with optional language and prompt context",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
