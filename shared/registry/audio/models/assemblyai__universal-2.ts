import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "assemblyai/universal-2";

export default {
    aliases: ["assemblyai-universal-2", "assemblyai-u2", "universal-2"],
    provider: "assemblyai",
    publisher: "AssemblyAI",
    category: "audio",
    addedDate: new Date("2026-05-02").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // AssemblyAI Universal-2: $0.15/hour
        promptAudioSeconds: 0.15 / 3600,
    },
    ...defineCostVariants(
        {
            diarization: {
                promptAudioSeconds: 0.17 / 3600,
            },
        },
        ({ input }) => (input?.hasDiarization ? "diarization" : undefined),
        {
            diarization: {
                label: "Speaker diarization",
                description: "Applies when response_format is diarized_json.",
            },
        },
        "Standard transcription",
        [
            {
                "key": "diarization",
                "label": "Speakers",
                "values": {
                    "": "Standard",
                    "diarization": "Identify",
                },
            },
        ],
    ),
    title: "AssemblyAI Universal-2",
    description: "Fast transcription with support for 99 languages",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
