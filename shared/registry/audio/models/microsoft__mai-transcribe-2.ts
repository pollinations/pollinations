import type { ModelDefinition } from "../../registry";
export const id = "microsoft/mai-transcribe-2";

export default {
    aliases: [],
    provider: "azure",
    publisher: "Microsoft",
    category: "audio",
    addedDate: new Date("2026-10-08").getTime(),
    paidOnly: false,
    priceMultiplier: 0.75,
    // Promotional $0.10/hour; standard $0.36/hour, expiry unpublished.
    // https://microsoft.ai/models/mai-transcribe-2/
    cost: { promptAudioSeconds: 0.1 / 3600 },
    title: "MAI Transcribe 2",
    description:
        "Multilingual file transcription with automatic language detection and timed segments",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
