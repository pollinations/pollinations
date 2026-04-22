import type { ModelDefinition } from "./registry";

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

export const ELEVENLABS_VOICES = Object.keys(VOICE_MAPPING);

export const DEFAULT_AUDIO_MODEL = "eleven-v3" as const;
export type AudioModelName = keyof typeof AUDIO_SERVICES;

export const AUDIO_SERVICES = {
    "eleven-v3": {
        brand: "ElevenLabs",
        provider: "elevenlabs",
        model: "eleven-v3",
        aliases: [
            "elevenlabs",
            "tts",
            "text-to-speech",
            "eleven",
            "tts-1",
            "tts-1-hd",
        ],
        description: "Text-to-speech generation.",
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        introducedAt: new Date("2026-02-07").getTime(),
        voices: ELEVENLABS_VOICES as string[],
        cost: {
            completionAudioTokens: 0.18 / 1000,
        },
    },
    "eleven-music-v1": {
        brand: "ElevenLabs",
        provider: "elevenlabs",
        model: "music-v1",
        aliases: ["elevenmusic", "music"],
        description: "Music generation from text prompts.",
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        paidOnly: true,
        introducedAt: new Date("2026-02-07").getTime(),
        cost: {
            completionAudioSeconds: 0.005,
        },
    },
    "whisper-large-v3": {
        brand: "OpenAI",
        provider: "ovhcloud",
        model: "whisper-large-v3",
        aliases: ["whisper", "whisper-1"],
        description: "Speech transcription to text.",
        category: "audio",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        alpha: true,
        introducedAt: new Date("2026-02-08").getTime(),
        cost: {
            promptAudioSeconds: 0.0000445,
        },
    },
    "scribe-v2": {
        brand: "ElevenLabs",
        provider: "elevenlabs",
        model: "scribe-v2",
        aliases: ["scribe", "scribe_v2"],
        description: "Speech transcription to text.",
        category: "audio",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        introducedAt: new Date("2026-02-13").getTime(),
        cost: {
            promptAudioSeconds: 0.0001111,
        },
    },
    "ace-step-1.5-turbo": {
        brand: "ACE-Step",
        provider: "lambda",
        model: "acestep-1.5-turbo",
        aliases: ["acestep", "ace-step", "acestep-music"],
        description: "Music generation from text prompts.",
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        alpha: true,
        introducedAt: new Date("2026-04-02").getTime(),
        cost: {
            completionAudioSeconds: 0.0005,
        },
    },
    "qwen3-tts-flash": {
        brand: "Qwen",
        provider: "alibaba",
        model: "qwen3-tts-flash",
        aliases: ["qwen-tts", "qwen3-tts"],
        description: "Text-to-speech generation.",
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        introducedAt: new Date("2026-04-19").getTime(),
        cost: {
            completionAudioTokens: 0.013 / 1000,
        },
        price: {
            completionAudioTokens: (0.013 * 1.5) / 1000,
        },
    },
    "qwen3-tts-instruct-flash": {
        brand: "Qwen",
        provider: "alibaba",
        model: "qwen3-tts-instruct-flash",
        aliases: ["qwen-tts-instruct", "qwen3-tts-instruct"],
        description:
            "Text-to-speech generation with emotion and style control.",
        category: "audio",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        paidOnly: true,
        introducedAt: new Date("2026-04-19").getTime(),
        cost: {
            completionAudioTokens: 0.013 / 1000,
        },
        price: {
            completionAudioTokens: 0.013 / 1000,
        },
    },
} satisfies Record<string, ModelDefinition>;

export function resolveElevenLabsVoiceId(voice: string): string {
    return VOICE_MAPPING[voice] ?? voice;
}
