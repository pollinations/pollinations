import type { ModelDefinition } from "../../registry";
export const id = "elevenlabs/scribe-v2-realtime";

export default {
    aliases: ["scribe-realtime"],
    provider: "elevenlabs",
    publisher: "ElevenLabs",
    category: "realtime",
    addedDate: new Date("2026-08-13").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // ElevenLabs Scribe v2 Realtime: $0.39 per streamed audio hour.
        promptAudioSeconds: 0.39 / 3600,
    },
    title: "Scribe v2 Realtime",
    description:
        "Live transcription in 90+ languages with incremental and final results",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/realtime", "/v1/realtime"],
} satisfies ModelDefinition;
