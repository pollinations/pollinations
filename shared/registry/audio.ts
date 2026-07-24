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

export const CSM_VOICES = [
    "conversational_a",
    "conversational_b",
    "read_speech_a",
    "read_speech_b",
    "read_speech_c",
    "read_speech_d",
] as const;

export const AUDIO_VOICES = [...ELEVENLABS_VOICES, ...CSM_VOICES];

export const DEFAULT_AUDIO_MODEL = "elevenlabs" as const;
export type AudioModelName = keyof typeof AUDIO_SERVICES;

export const AUDIO_SERVICES = {
    elevenlabs: {
        aliases: ["tts", "text-to-speech", "eleven", "tts-1", "tts-1-hd"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-07").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // ElevenLabs v3 via API: measured 0.60 credits/char (API-discounted
            // from the 1 cr/char UI rate) * $0.166/1k Scale credits = $0.10/1k chars
            // (matches elevenlabs.io/pricing/api).
            completionAudioTokens: 0.1 / 1000,
        },
        title: "ElevenLabs v3 TTS",
        description: "Expressive speech with emotion control and audio tags",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
    },
    elevenflash: {
        aliases: ["tts-flash", "eleven-flash", "flash"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-05-14").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Flash v2.5 via API: measured 0.30 credits/char
            // (API-discounted from the 0.5 cr/char UI rate) * $0.166/1k Scale
            // credits = $0.05/1k chars (matches elevenlabs.io/pricing/api).
            completionAudioTokens: 0.05 / 1000,
        },
        title: "ElevenLabs Flash v2.5",
        description:
            "Snappy low-latency speech in 32 languages; leaner than the premium voices",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
    },
    "eleven-multilingual-v2": {
        aliases: ["multilingual-v2", "eleven-v2", "tts-multilingual"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-06-22").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Multilingual v2 via API: measured 0.60 credits/char
            // (API-discounted from the 1 cr/char UI rate) * $0.166/1k Scale credits
            // = $0.10/1k chars (matches elevenlabs.io/pricing/api).
            completionAudioTokens: 0.1 / 1000,
        },
        title: "ElevenLabs Multilingual v2",
        description: "Lifelike, emotionally rich speech in 29 languages",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
    },
    elevenmusic: {
        aliases: ["music"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // ElevenLabs Music v2: billed per second of output audio.
            // Measured empirically (ffprobe-verified, 10s & 30s clips): 15.05 credits/sec.
            // Scale plan $0.166/1k credits => 15.05 * 0.166/1000 ≈ $0.0025/sec ($0.15/min).
            completionAudioSeconds: 0.0025,
        },
        title: "ElevenLabs Music",
        description: "Studio-grade music from a text prompt or reference track",
        inputModalities: ["text", "audio"],
        outputModalities: ["audio"],
    },
    "eleven-sfx": {
        aliases: ["sfx", "sound-effects", "eleven-sound-effects"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-06-22").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Sound Effects: $0.12/minute.
            completionAudioSeconds: 0.002,
        },
        title: "ElevenLabs Sound Effects",
        description: "Sound effects from a text description",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    whisper: {
        aliases: ["whisper-1", "whisper-large-v3"],
        provider: "ovhcloud",
        brand: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        priceMultiplier: 1,
        cost: {
            // OVH Whisper: €0.00004083/sec ≈ $0.0000445/sec
            promptAudioSeconds: 0.0000445,
        },
        title: "Whisper Large V3",
        description: "Accurate, affordable speech-to-text transcription",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    scribe: {
        aliases: ["scribe_v2", "scribe-v2"],
        provider: "elevenlabs",
        brand: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-13").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Scale plan: Scribe batch $0.22/hour
            promptAudioSeconds: 0.22 / 3600,
        },
        title: "Scribe v2",
        description: "Transcription in 90+ languages with speaker labels",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    "universal-2": {
        aliases: ["assemblyai-universal-2", "assemblyai-u2"],
        provider: "assemblyai",
        brand: "AssemblyAI",
        category: "audio",
        addedDate: new Date("2026-05-02").getTime(),
        priceMultiplier: 1,
        cost: {
            // AssemblyAI Universal-2: $0.15/hour
            promptAudioSeconds: 0.15 / 3600,
        },
        title: "AssemblyAI Universal-2",
        description: "Fast transcription with support for 99 languages",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    "universal-3-pro": {
        aliases: [
            "assemblyai-universal-3-pro",
            "assemblyai-u3-pro",
            "assemblyai-pro",
        ],
        provider: "assemblyai",
        brand: "AssemblyAI",
        category: "audio",
        addedDate: new Date("2026-05-02").getTime(),
        priceMultiplier: 1,
        cost: {
            // AssemblyAI Universal-3 Pro: $0.21/hour
            promptAudioSeconds: 0.21 / 3600,
        },
        title: "AssemblyAI Universal-3 Pro",
        description: "Top-accuracy transcription you can steer with prompts",
        inputModalities: ["audio"],
        outputModalities: ["text"],
    },
    "stable-audio-3-medium": {
        aliases: ["stable-audio", "stability-audio", "stable-audio-2.5"],
        provider: "fal",
        brand: "Stability AI",
        category: "audio",
        addedDate: new Date("2026-06-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        flatRate: true,
        cost: {
            // Flat per-generation fee (fal model pages 2026-06-23):
            //   text-to-audio  $0.0376  (output audio)
            //   audio-to-audio $0.0417  (+$0.0041 for the reference-clip input)
            // The handler bills whole units: 1 completion audio unit always, plus
            // 1 prompt audio unit for audio-to-audio (see gen audio.ts).
            promptAudioTokens: 0.0417 - 0.0376,
            completionAudioTokens: 0.0376,
        },
        title: "Stable Audio 3 Medium",
        description: "Long-form stereo music and soundscapes in studio quality",
        inputModalities: ["text", "audio"],
        outputModalities: ["audio"],
    },
    "stable-audio-3-large": {
        // Distinct from stable-audio-3-medium (fal): this is the larger
        // API-only model served by Stability's direct API. Keep aliases
        // non-overlapping with the medium entry.
        aliases: ["stable-audio-3", "stable-audio-large"],
        provider: "stability",
        brand: "Stability AI",
        category: "audio",
        addedDate: new Date("2026-06-23").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        flatRate: true,
        cost: {
            // Stability Stable Audio 3.0 via the direct API: flat 26 credits/
            // generation (Stable Audio 2.5 was 20); credits are $0.01 each → $0.26.
            // Same fee for text-to-audio and audio-to-audio, so no audio-input
            // surcharge — the handler bills one flat completion audio unit.
            completionAudioTokens: 0.26,
        },
        title: "Stable Audio 3 Large",
        description:
            "Highest-quality long-form stereo music generation; priced per generation",
        inputModalities: ["text", "audio"],
        outputModalities: ["audio"],
    },
    "qwen-tts": {
        aliases: ["qwen3-tts", "qwen3-tts-flash"],
        provider: "alibaba",
        brand: "Qwen",
        category: "audio",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // DashScope Qwen3-TTS-Flash: $0.10 per 10K characters
            completionAudioTokens: 0.01 / 1000,
        },
        title: "Qwen3-TTS Flash",
        description: "Fast multilingual text-to-speech at low cost",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "qwen-tts-instruct": {
        aliases: ["qwen3-tts-instruct", "qwen3-tts-instruct-flash"],
        provider: "alibaba",
        brand: "Qwen",
        category: "audio",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // DashScope Qwen3-TTS-Instruct-Flash: $0.115 per 10K characters
            completionAudioTokens: 0.0115 / 1000,
        },
        title: "Qwen3-TTS Instruct",
        description:
            "Text-to-speech you can direct with emotion and style instructions",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "csm-1b": {
        aliases: ["csm", "sesame-csm", "sesame-csm-1b"],
        provider: "deepinfra",
        brand: "Sesame",
        category: "audio",
        addedDate: new Date("2026-07-23").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // DeepInfra bills CSM by input character: $7 per 1M characters.
            completionAudioTokens: 7 / 1_000_000,
        },
        title: "CSM 1B",
        description:
            "English conversational speech with six reading and dialogue voices",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...CSM_VOICES],
    },
} satisfies Record<string, ModelDefinition>;

export function resolveElevenLabsVoiceId(voice: string): string {
    return VOICE_MAPPING[voice] ?? voice;
}
