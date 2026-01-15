import { COST_START_DATE } from "./price-helpers";
import type { ServiceDefinition } from "./registry";

// ElevenLabs voices available for TTS
export const ELEVENLABS_VOICES = [
    // OpenAI-compatible voice names
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
    // ElevenLabs native voices - Female
    "rachel",
    "domi",
    "bella",
    "elli",
    "charlotte",
    "dorothy",
    "sarah",
    "emily",
    "lily",
    "matilda",
    // ElevenLabs native voices - Male
    "adam",
    "antoni",
    "arnold",
    "josh",
    "sam",
    "daniel",
    "charlie",
    "james",
    "fin",
    "callum",
    "liam",
    "george",
    "brian",
    "bill",
] as const;

export type ElevenLabsVoice = (typeof ELEVENLABS_VOICES)[number];

export const DEFAULT_AUDIO_MODEL = "elevenlabs" as const;
export type AudioServiceId = keyof typeof AUDIO_SERVICES;
export type AudioModelId = (typeof AUDIO_SERVICES)[AudioServiceId]["modelId"];

/**
 * Helper to convert dollars per 1000 characters to dollars per character
 */
function perThousandChars(dollarsPerThousand: number): number {
    return dollarsPerThousand / 1000;
}

export const AUDIO_SERVICES = {
    elevenlabs: {
        aliases: ["tts", "text-to-speech", "eleven", "tts-1", "tts-1-hd"],
        modelId: "eleven_multilingual_v2",
        provider: "elevenlabs",
        cost: [
            {
                date: COST_START_DATE,
                // ElevenLabs pricing: ~$0.18 per 1000 characters (average across plans)
                // Based on: 1 credit = 1 character, ~$0.15-0.22 per 1000 credits depending on plan
                // We use completionAudioTokens to track character usage
                completionAudioTokens: perThousandChars(0.18),
            },
        ],
        description: "ElevenLabs Text-to-Speech - Natural & Expressive Voices",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as unknown as string[],
    },
} satisfies Record<string, ServiceDefinition<string>>;
