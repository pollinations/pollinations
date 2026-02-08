import type { ServiceDefinition } from "./registry";

// Voice name to ElevenLabs voice ID mapping
export const VOICE_MAPPING: Record<string, string> = {
    // OpenAI-compatible voice names
    alloy: "21m00Tcm4TlvDq8ikWAM", // Rachel
    echo: "29vD33N1CtxCmqQRPOHJ", // Drew
    fable: "EXAVITQu4vr4xnSDxMaL", // Bella
    onyx: "ErXwobaYiN019PkySvjV", // Antoni
    nova: "MF3mGyEYCl7XYWbV9V6O", // Elli
    shimmer: "ThT5KcBeYPX3keUQqHPh", // Dorothy
    // Additional OpenAI TTS voices
    ash: "dXtC3XhB9GtPusIpNtQx", // Hale
    ballad: "q0IMILNRPxOgtBTS4taI", // Drew
    coral: "gJx1vCzNCD1EQHT212Ls", // Coral
    sage: "wJqPPQ618aTW29mptyoc", // ana rita
    verse: "eXpIbVcVbLo8ZJQDlDnl", // Siren
    // ElevenLabs native voices - Female
    rachel: "21m00Tcm4TlvDq8ikWAM", // Calm, conversational
    domi: "AZnzlk1XvdvUeBnXmlld", // Strong, confident
    bella: "EXAVITQu4vr4xnSDxMaL", // Soft, gentle
    elli: "MF3mGyEYCl7XYWbV9V6O", // Young, bright
    charlotte: "XB0fDUnXU5powFXDhCwa", // Sophisticated, seductive
    dorothy: "ThT5KcBeYPX3keUQqHPh", // Pleasant, British
    sarah: "EXAVITQu4vr4xnSDxMaL", // Soft, news anchor
    emily: "LcfcDJNUP1GQjkzn1xUU", // Calm, gentle
    lily: "pFZP5JQG7iQjIQuC4Bku", // Warm, British narrator
    matilda: "XrExE9yKIg1WjnnlVkGX", // Warm, friendly
    // ElevenLabs native voices - Male
    adam: "pNInz6obpgDQGcFmaJgB", // Deep, natural
    antoni: "ErXwobaYiN019PkySvjV", // Well-rounded, calm
    arnold: "VR6AewLTigWG4xSOukaG", // Crisp, deep
    josh: "TxGEqnHWrfWFTfGW9XjX", // Deep, young American
    sam: "yoZ06aMxZJJ28mfd3POQ", // Raspy, young American
    daniel: "onwK4e9ZLuTAKqWW03F9", // Deep, British
    charlie: "IKne3meq5aSn9XLyUdCD", // Casual Australian
    james: "ZQe5CZNOzWyzPSCn5a3c", // Calm, old British
    fin: "D38z5RcWu1voky8WS1ja", // Sailor, Irish
    callum: "N2lVS1w4EtoT3dr4eOWO", // Intense, transatlantic
    liam: "TX3LPaxmHKxFdv7VOQHJ", // Articulate, neutral
    george: "JBFqnCBsd6RMkjVDRZzb", // Warm, British
    brian: "nPczCjzI2devNBz1zQrb", // Deep, American narrator
    bill: "pqHfZKP75CvOlQylNhV4", // Trustworthy, American
};

export const ELEVENLABS_VOICES = Object.keys(
    VOICE_MAPPING,
) as (keyof typeof VOICE_MAPPING)[];
export type ElevenLabsVoice = keyof typeof VOICE_MAPPING;

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
                date: new Date("2026-02-07").getTime(),
                // ElevenLabs pricing: ~$0.18 per 1000 characters (average across plans)
                // Based on: 1 credit = 1 character, ~$0.15-0.22 per 1000 credits depending on plan
                // We use completionAudioTokens to track character usage
                completionAudioTokens: perThousandChars(0.18),
            },
        ],
        description: "ElevenLabs Text-to-Speech - Natural & Expressive Voices",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
    },
    elevenmusic: {
        aliases: ["music"],
        modelId: "music_v1",
        provider: "elevenlabs",
        cost: [
            {
                date: new Date("2026-02-07").getTime(),
                // ElevenLabs Music: billed by output audio duration
                // ~$0.30 per minute ≈ $0.005 per second (Scale plan pricing)
                completionAudioSeconds: 0.005,
            },
        ],
        description:
            "ElevenLabs Music - Generate studio-grade music from text prompts",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    whisper: {
        aliases: ["whisper-1", "whisper-large-v3"],
        modelId: "whisper-large-v3",
        provider: "ovhcloud",
        cost: [
            {
                date: new Date("2026-02-08").getTime(),
                // OVH Whisper: €0.00004083/sec ≈ $0.0000445/sec
                promptAudioSeconds: 0.0000445,
            },
        ],
        description:
            "Whisper Large V3 - Speech to Text Transcription (OVHcloud)",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        alpha: true,
    },
} satisfies Record<string, ServiceDefinition<string>>;
