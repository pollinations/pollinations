import { defineCostVariants } from "../../cost-variants";
import type { ModelDefinition } from "../../registry";

export const id = "assemblyai/universal-3.5-pro";

export default {
    aliases: [
        "universal-3-pro",
        "universal-3-5-pro",
        "assemblyai-universal-3.5-pro",
        "assemblyai-universal-3-5-pro",
        "assemblyai-u3.5-pro",
        "assemblyai-universal-3-pro",
        "assemblyai-u3-pro",
        "assemblyai-pro",
        "universal-3.5-pro",
    ],
    provider: "assemblyai",
    publisher: "AssemblyAI",
    category: "audio",
    addedDate: new Date("2026-05-02").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        // AssemblyAI Universal-3.5 Pro async: $0.21/hour
        promptAudioSeconds: 0.21 / 3600,
    },
    ...defineCostVariants(
        {
            prompting: {
                promptAudioSeconds: 0.26 / 3600,
            },
            diarization: {
                promptAudioSeconds: 0.23 / 3600,
            },
            prompting_diarization: {
                promptAudioSeconds: 0.28 / 3600,
            },
        },
        ({ input }) => {
            if (input?.hasPrompt) {
                return input.hasDiarization
                    ? "prompting_diarization"
                    : "prompting";
            }
            return input?.hasDiarization ? "diarization" : undefined;
        },
        {
            prompting: {
                label: "Prompting",
                description: "Applies when a prompt is provided.",
            },
            diarization: {
                label: "Speaker diarization",
                description: "Applies when response_format is diarized_json.",
            },
            prompting_diarization: {
                label: "Prompting and speaker diarization",
                description:
                    "Applies when a prompt is provided and response_format is diarized_json.",
            },
        },
        "Standard transcription",
        [
            {
                "key": "prompting",
                "label": "Prompting",
                "values": {
                    "": "Off",
                    "prompting": "On",
                    "diarization": "Off",
                    "prompting_diarization": "On",
                },
            },
            {
                "key": "diarization",
                "label": "Speakers",
                "values": {
                    "": "Standard",
                    "prompting": "Standard",
                    "diarization": "Identify",
                    "prompting_diarization": "Identify",
                },
            },
        ],
    ),
    title: "AssemblyAI Universal-3.5 Pro",
    description:
        "High-accuracy transcription with multilingual code switching and prompts",
    inputModalities: ["audio"],
    outputModalities: ["text"],
    supportedEndpoints: ["/v1/audio/transcriptions"],
} satisfies ModelDefinition;
