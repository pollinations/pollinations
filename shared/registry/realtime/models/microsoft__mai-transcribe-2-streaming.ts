import type { ModelDefinition } from "../../registry";
export const id = "microsoft/mai-transcribe-2-streaming";

export default {
    aliases: [],
    provider: "azure",
    publisher: "Microsoft",
    category: "realtime",
    addedDate: new Date("2026-10-08").getTime(),
    paidOnly: false,
    priceMultiplier: 0.75,
    // Introductory rate through 2026-12-31; subsequent rate is unpublished.
    cost: { promptAudioSeconds: 0.54 / 3600 },
    title: "MAI Transcribe 2 Streaming",
    description:
        "Live multilingual transcription with incremental finalized text; manual commits and 16/24 kHz PCM audio",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/realtime", "/v1/realtime"],
} satisfies ModelDefinition;
