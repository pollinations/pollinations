import type { ModelDefinition } from "../../registry";
export const id = "openai/gpt-live-transcribe";

export default {
    aliases: ["gpt-live-transcribe"],
    provider: "azure",
    publisher: "OpenAI",
    category: "realtime",
    addedDate: new Date("2026-08-19").getTime(),
    // Provider retires this route on 2028-02-01.
    paidOnly: false,
    priceMultiplier: 0.75,
    cost: {
        // Provisional OpenAI list price: $0.017 per streamed input minute.
        // Azure's exact meter was not yet visible when this route launched.
        promptAudioSeconds: 0.017 / 60,
    },
    title: "GPT Live Transcribe",
    description:
        "Low-latency streaming speech recognition through the OpenAI Realtime protocol",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/realtime", "/v1/realtime"],
} satisfies ModelDefinition;
