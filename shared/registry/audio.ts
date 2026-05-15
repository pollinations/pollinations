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

export const DEFAULT_AUDIO_MODEL = "elevenlabs" as const;
export type AudioModelName = keyof typeof AUDIO_SERVICES;
export type AudioModelId = (typeof AUDIO_SERVICES)[AudioModelName]["modelId"];

export const AUDIO_SERVICES = {
    elevenlabs: {
        aliases: ["tts", "text-to-speech", "eleven", "tts-1", "tts-1-hd"],
        modelId: "eleven_v3",
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-07").getTime(),
        paidOnly: true,
        cost: {
            // ElevenLabs Scale plan: 1 credit/char * $0.166/1k credits
            completionAudioTokens: 0.166 / 1000,
        },
        description:
            "ElevenLabs v3 TTS - Expressive voices with emotions & audio tags",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        alpha: true,
    },
    elevenflash: {
        aliases: ["tts-flash", "eleven-flash", "flash"],
        modelId: "eleven_flash_v2_5",
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-05-14").getTime(),
        cost: {
            // ElevenLabs Scale plan: Flash v2.5 = 0.5 credit/char
            completionAudioTokens: 0.083 / 1000,
        },
        description:
            "ElevenLabs Flash v2.5 - Fast, low-latency TTS (~75ms, 32 languages)",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        alpha: true,
    },
    elevenmusic: {
        aliases: ["music"],
        modelId: "music_v1",
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        paidOnly: true,
        cost: {
            // ElevenLabs Music: billed by output audio duration
            // ~$0.30 per minute ≈ $0.005 per second (Scale plan pricing)
            completionAudioSeconds: 0.005,
        },
        description:
            "ElevenLabs Music - Generate studio-grade music from text prompts",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        alpha: true,
    },
    whisper: {
        aliases: ["whisper-1", "whisper-large-v3"],
        modelId: "whisper-large-v3",
        provider: "ovhcloud",
        brand: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        cost: {
            // OVH Whisper: €0.00004083/sec ≈ $0.0000445/sec
            promptAudioSeconds: 0.0000445,
        },
        description: "Whisper Large V3 - Speech to text transcription",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        alpha: true,
    },
    scribe: {
        aliases: ["scribe_v2", "scribe-v2"],
        modelId: "scribe_v2",
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-13").getTime(),
        cost: {
            // ElevenLabs Scale plan: Scribe batch $0.22/hour
            promptAudioSeconds: 0.22 / 3600,
        },
        description:
            "ElevenLabs Scribe v2 - Speech to Text (90+ languages, diarization)",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    "universal-2": {
        aliases: ["assemblyai-universal-2", "assemblyai-u2"],
        modelId: "universal-2",
        provider: "assemblyai",
        brand: "AssemblyAI",
        category: "audio",
        addedDate: new Date("2026-05-02").getTime(),
        cost: {
            // AssemblyAI Universal-2: $0.15/hour
            promptAudioSeconds: 0.15 / 3600,
        },
        description:
            "AssemblyAI Universal-2 - Fast speech to text with 99-language support",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    "universal-3-pro": {
        aliases: [
            "assemblyai-universal-3-pro",
            "assemblyai-u3-pro",
            "assemblyai-pro",
        ],
        modelId: "universal-3-pro",
        provider: "assemblyai",
        brand: "AssemblyAI",
        category: "audio",
        addedDate: new Date("2026-05-02").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // AssemblyAI Universal-3 Pro: $0.21/hour
            promptAudioSeconds: 0.21 / 3600,
        },
        description:
            "AssemblyAI Universal-3 Pro - High-accuracy speech to text with prompting",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    acestep: {
        aliases: ["ace-step", "acestep-music"],
        modelId: "acestep_v15_turbo",
        provider: "lambda",
        brand: "ACE-Step",
        category: "audio",
        addedDate: new Date("2026-04-03").getTime(),
        cost: {
            completionAudioSeconds: 0.0005,
        },
        description:
            "ACE-Step 1.5 Turbo - Fast open-source music generation with lyrics support",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        alpha: true,
    },
    "qwen-tts": {
        aliases: ["qwen3-tts", "qwen3-tts-flash"],
        modelId: "qwen3-tts-flash",
        provider: "alibaba",
        brand: "Qwen",
        category: "audio",
        addedDate: new Date("2026-04-22").getTime(),
        priceMultiplier: 1.5,
        cost: {
            // DashScope Qwen3-TTS-Flash: ~$0.013 per 1K characters
            completionAudioTokens: 0.013 / 1000,
        },
        description: "Qwen3-TTS Flash - Fast multilingual text-to-speech",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "qwen-tts-instruct": {
        aliases: ["qwen3-tts-instruct", "qwen3-tts-instruct-flash"],
        modelId: "qwen3-tts-instruct-flash",
        provider: "alibaba",
        brand: "Qwen",
        category: "audio",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            completionAudioTokens: 0.013 / 1000,
        },
        description: "Qwen3-TTS Instruct - TTS with emotion & style control",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
} satisfies Record<string, ModelDefinition<string>>;

export function resolveElevenLabsVoiceId(voice: string): string {
    return VOICE_MAPPING[voice] ?? voice;
}
