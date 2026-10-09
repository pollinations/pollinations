import { AUDIO_FALLBACKS } from "./audio-fallbacks";
import { defineCostVariants } from "./cost-variants";
import { mergeFallbacks } from "./merge-fallbacks";
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

export const KOKORO_VOICES = [
    "af_alloy",
    "af_aoede",
    "af_bella",
    "af_heart",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_river",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
    "am_santa",
    "bf_alice",
    "bf_emma",
    "bf_isabella",
    "bf_lily",
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis",
    "ef_dora",
    "em_alex",
    "em_santa",
    "ff_siwis",
    "hf_alpha",
    "hf_beta",
    "hm_omega",
    "hm_psi",
    "if_sara",
    "im_nicola",
    "jf_alpha",
    "jf_gongitsune",
    "jf_nezumi",
    "jf_tebukuro",
    "jm_kumo",
    "pf_dora",
    "pm_alex",
    "pm_santa",
    "zf_xiaobei",
    "zf_xiaoni",
    "zf_xiaoxiao",
    "zf_xiaoyi",
    "zm_yunjian",
    "zm_yunxi",
    "zm_yunxia",
    "zm_yunyang",
] as const;

export const XAI_TTS_VOICES = [
    "altair",
    "ara",
    "atlas",
    "aurora",
    "carina",
    "castor",
    "celeste",
    "cosmo",
    "eve",
    "helios",
    "helix",
    "iris",
    "kepler",
    "leo",
    "liora",
    "lumen",
    "luna",
    "lux",
    "naksh",
    "orion",
    "perseus",
    "rex",
    "rigel",
    "sal",
    "sirius",
    "ursa",
    "zagan",
    "zenith",
] as const;

export const GEMINI_TTS_VOICES = [
    "Zephyr",
    "Puck",
    "Charon",
    "Kore",
    "Fenrir",
    "Leda",
    "Orus",
    "Aoede",
    "Callirrhoe",
    "Autonoe",
    "Enceladus",
    "Iapetus",
    "Umbriel",
    "Algieba",
    "Despina",
    "Erinome",
    "Algenib",
    "Rasalgethi",
    "Laomedeia",
    "Achernar",
    "Alnilam",
    "Schedar",
    "Gacrux",
    "Pulcherrima",
    "Achird",
    "Zubenelgenubi",
    "Vindemiatrix",
    "Sadachbia",
    "Sadaltager",
    "Sulafat",
] as const;

// Microsoft MAI-Voice-2.1 voice ids without the model suffix; the upstream
// (OpenRouter/Azure) expects `<id>:MAI-Voice-2.1` or `<id>:MAI-Voice-2.1-Flash`.
// Source: OpenRouter models API supported_voices (identical 97 for both
// variants), verified 2026-10-08.
export const MAI_VOICE_21_VOICES = [
    "cs-CZ-Grant",
    "cs-CZ-Harper",
    "da-DK-Grant",
    "da-DK-Harper",
    "de-DE-Grant",
    "de-DE-Harper",
    "de-DE-Klaus",
    "de-DE-Mia",
    "en-AU-Isla",
    "en-GB-Emily",
    "en-GB-Harry",
    "en-IN-Dhruv",
    "en-IN-Priya",
    "en-US-Ethan",
    "en-US-Grant",
    "en-US-Harper",
    "en-US-Iris",
    "en-US-Jasper",
    "en-US-Olivia",
    "en-US-Sage",
    "es-ES-Marta",
    "es-MX-Alejo",
    "es-MX-Grant",
    "es-MX-Harper",
    "es-MX-Valeria",
    "fi-FI-Grant",
    "fi-FI-Harper",
    "fr-FR-Grant",
    "fr-FR-Harper",
    "fr-FR-Marc",
    "fr-FR-Soleil",
    "hi-IN-Arjun",
    "hi-IN-Dhruv",
    "hi-IN-Grant",
    "hi-IN-Harper",
    "hi-IN-Kavya",
    "hi-IN-Priya",
    "hu-HU-Bence",
    "hu-HU-Grant",
    "hu-HU-Harper",
    "hu-HU-Levente",
    "hu-HU-Lilla",
    "hu-HU-Reka",
    "id-ID-Grant",
    "id-ID-Harper",
    "it-IT-Grant",
    "it-IT-Harper",
    "it-IT-Luca",
    "it-IT-Rosa",
    "ko-KR-Grant",
    "ko-KR-Haena",
    "ko-KR-Harper",
    "ko-KR-Junho",
    "nb-NO-Grant",
    "nb-NO-Harper",
    "nl-NL-Grant",
    "nl-NL-Harper",
    "nl-NL-Sander",
    "pl-PL-Grant",
    "pl-PL-Harper",
    "pt-BR-Caio",
    "pt-BR-Grant",
    "pt-BR-Harper",
    "pt-BR-Luana",
    "pt-BR-Pedro",
    "pt-BR-Rafael",
    "pt-PT-Grant",
    "pt-PT-Harper",
    "pt-PT-Rui",
    "ro-RO-Andrei",
    "ro-RO-Elena",
    "ro-RO-Grant",
    "ro-RO-Harper",
    "ro-RO-Ioana",
    "ro-RO-Radu",
    "ru-RU-Grant",
    "ru-RU-Harper",
    "ru-RU-Lev",
    "ru-RU-Masha",
    "sv-SE-Grant",
    "sv-SE-Harper",
    "th-TH-Grant",
    "th-TH-Harper",
    "th-TH-Krit",
    "th-TH-Nattapong",
    "tr-TR-Aydin",
    "tr-TR-Elif",
    "tr-TR-Grant",
    "tr-TR-Harper",
    "vi-VN-Grant",
    "vi-VN-Harper",
    "zh-CN-Bo",
    "zh-CN-Grant",
    "zh-CN-Harper",
    "zh-CN-Lan",
    "zh-CN-Mei",
    "zh-CN-Wei",
] as const;

// DashScope system voices; DashScope also accepts its base voices by name.
export const QWEN_AUDIO_TTS_VOICES = [
    "loongeva_v3.6",
    "loongjohn",
    "loongmary",
    "longanfengyue",
    "longanyuanfei",
    "longanlingxi",
    "longanxiaoxin",
    "longanhuan_v3.6",
    "longjielidou_v3.6",
    "longpaopao_v3.6",
    "longhuohuo_v3.6",
    "longchuanshu_v3.6",
] as const;

export const AUDIO_VOICES = [
    ...ELEVENLABS_VOICES,
    ...CSM_VOICES,
    ...KOKORO_VOICES,
    ...XAI_TTS_VOICES,
    ...GEMINI_TTS_VOICES,
    ...MAI_VOICE_21_VOICES,
    ...QWEN_AUDIO_TTS_VOICES,
];

// Requests without a model must work on Quest Pollen, so the default stays
// on a model that is not paid-only.
export const DEFAULT_AUDIO_MODEL = "openai/tts-1" as const;
const AUDIO_BASE_SERVICES = {
    "elevenlabs/eleven-v4": {
        aliases: [],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-10-06").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // https://elevenlabs.io/pricing/api — current launch rate.
            // Update explicitly when the provider changes its rate.
            completionAudioTokens: 0.022 / 1000,
        },
        title: "ElevenLabs v4",
        description:
            "Expressive speech in 90+ languages with audio tags and character timestamps",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: [
            "/audio/{text}",
            "/v1/audio/speech",
            "/v1/audio/speech/with-timestamps",
        ],
    },
    "elevenlabs/eleven-v4-turbo": {
        aliases: [],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-10-06").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // https://elevenlabs.io/pricing/api — current launch rate.
            // Update explicitly when the provider changes its rate.
            completionAudioTokens: 0.011 / 1000,
        },
        title: "ElevenLabs v4 Turbo",
        description:
            "Low-latency expressive speech in 90+ languages with audio tags and character timestamps",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: [
            "/audio/{text}",
            "/v1/audio/speech",
            "/v1/audio/speech/with-timestamps",
        ],
    },
    "elevenlabs/eleven-v3": {
        aliases: ["tts", "text-to-speech", "eleven", "elevenlabs"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
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
        description:
            "Expressive speech with emotion controls, audio tags, and character timestamps",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: [
            "/audio/{text}",
            "/v1/audio/speech",
            "/v1/audio/speech/with-timestamps",
        ],
    },
    "elevenlabs/eleven-flash-v2.5": {
        aliases: ["tts-flash", "eleven-flash", "flash", "elevenflash"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
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
            "Low-latency speech in 32 languages with character timestamps",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: [
            "/audio/{text}",
            "/v1/audio/speech",
            "/v1/audio/speech/with-timestamps",
        ],
    },
    "elevenlabs/eleven-multilingual-v2": {
        aliases: [
            "multilingual-v2",
            "eleven-v2",
            "tts-multilingual",
            "eleven-multilingual-v2",
        ],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
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
        description:
            "Emotionally rich speech in 29 languages with character timestamps",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: [
            "/audio/{text}",
            "/v1/audio/speech",
            "/v1/audio/speech/with-timestamps",
        ],
    },
    "elevenlabs/eleven-v3:dialogue": {
        aliases: ["eleven-dialogue", "dialogue", "text-to-dialogue"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-07-26").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Text to Dialogue uses the v3 TTS character rate.
            completionAudioTokens: 0.1 / 1000,
        },
        title: "ElevenLabs Text to Dialogue",
        description:
            "Multi-speaker conversations with expressive voices and audio cues",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
    },
    "elevenlabs/eleven-multilingual-sts-v2": {
        aliases: ["voice-changer", "speech-to-speech", "eleven-voice-changer"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-07-26").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Voice Changer: $0.12 per input minute.
            promptAudioSeconds: 0.12 / 60,
        },
        title: "ElevenLabs Voice Changer",
        description:
            "Preserves delivery and emotion while transforming speaker identity",
        inputModalities: ["audio"],
        outputModalities: ["audio"],
        voices: ELEVENLABS_VOICES as string[],
        supportedEndpoints: ["/v1/audio/voice-changer"],
    },
    "elevenlabs/voice-isolator": {
        aliases: ["voice-isolator", "audio-cleanup", "eleven-voice-isolator"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-07-26").getTime(),
        priceMultiplier: 1,
        cost: {
            // ElevenLabs Voice Isolator: $0.12 per input minute.
            promptAudioSeconds: 0.12 / 60,
        },
        title: "ElevenLabs Voice Isolator",
        description:
            "Removes background noise while preserving clear spoken audio",
        inputModalities: ["audio", "video"],
        outputModalities: ["audio"],
        supportedEndpoints: ["/v1/audio/voice-isolator"],
    },
    "elevenlabs/stem-separation": {
        aliases: [],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        paidOnly: true,
        addedDate: new Date("2026-09-26").getTime(),
        priceMultiplier: 1,
        // Workspace analytics: 20s input costs $0.10 (six) or $0.05 (two).
        cost: { promptAudioSeconds: 0.3 / 60 },
        ...defineCostVariants(
            { two_stems_v1: { promptAudioSeconds: 0.15 / 60 } },
            ({ input }) =>
                input?.stemVariation === "two_stems_v1"
                    ? "two_stems_v1"
                    : undefined,
            {
                two_stems_v1: {
                    label: "Two stems",
                    description:
                        "Vocals and instrumental; stem_variation_id=two_stems_v1.",
                },
            },
            "Six stems",
            [
                {
                    key: "stem_variation_id",
                    label: "Stems",
                    values: { "": "Six", two_stems_v1: "Two" },
                },
            ],
        ),
        title: "ElevenLabs Stem Separation",
        description:
            "Separate vocals and instruments into two or six downloadable audio tracks",
        inputModalities: ["audio"],
        outputModalities: ["audio"],
        supportedEndpoints: ["/alpha/audio/stem-separation"],
    },
    "elevenlabs/music-v2": {
        aliases: ["music", "elevenmusic"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // ElevenLabs Music v2: reference ingestion and generated output
            // are each billed at $0.15/minute.
            promptAudioSeconds: 0.0025,
            // Measured empirically (ffprobe-verified, 10s & 30s clips): 15.05 credits/sec.
            // Scale plan $0.166/1k credits => 15.05 * 0.166/1000 ≈ $0.0025/sec ($0.15/min).
            completionAudioSeconds: 0.0025,
        },
        title: "ElevenLabs Music",
        description: "Studio-grade music from a text prompt or reference track",
        inputModalities: ["text", "audio"],
        outputModalities: ["audio"],
        minDuration: 3,
        maxDuration: 300,
    },
    "elevenlabs/music-v2.5": {
        aliases: [],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
        category: "audio",
        addedDate: new Date("2026-09-11").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // ElevenLabs Music v2.5: reference ingestion and generated output
            // are each billed at $0.15/minute.
            promptAudioSeconds: 0.0025,
            completionAudioSeconds: 0.0025,
        },
        title: "ElevenLabs Music v2.5",
        description:
            "Richer, better prompt-following music from text or a reference track",
        inputModalities: ["text", "audio"],
        outputModalities: ["audio"],
        minDuration: 3,
        maxDuration: 300,
    },
    "google/lyria-3.5": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "audio",
        addedDate: new Date("2026-09-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        flatRate: true,
        cost: {
            // Gemini Developer API bills $0.08 per generated song, including input.
            completionAudioTokens: 0.08,
        },
        title: "Lyria 3.5",
        description:
            "Full songs with vocals or instrumental arrangements; describe structure and approximate duration in the prompt",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "google/lyria-3-clip-preview": {
        aliases: ["lyria", "lyria-3", "lyria-3-clip"],
        provider: "google",
        publisher: "Google",
        category: "audio",
        addedDate: new Date("2026-07-24").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            // Vertex bills a fixed $0.04 for each 30-second generated clip.
            completionAudioTokens: 0.04,
        },
        flatRate: true,
        title: "Lyria 3 Clip Preview",
        description:
            "30-second music with vocals, lyrics, or instrumental arrangements",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        allowedDurations: [30],
    },
    "elevenlabs/eleven-text-to-sound-v2": {
        aliases: ["sfx", "sound-effects", "eleven-sound-effects", "eleven-sfx"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
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
    "openai/whisper-large-v3": {
        aliases: ["whisper-1", "whisper-large-v3", "whisper"],
        provider: "ovhcloud",
        publisher: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-02-08").getTime(),
        priceMultiplier: 1,
        paidOnly: false,
        cost: {
            // OVHcloud USD list price: $0.163/hour.
            promptAudioSeconds: 0.163 / 3600,
        },
        title: "Whisper Large V3",
        description: "Accurate, affordable speech-to-text transcription",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/audio/transcriptions"],
    },
    "openai/gpt-transcribe": {
        // gpt-4o-transcribe is the name OpenAI clients send by default.
        aliases: ["gpt-transcribe", "gpt-4o-transcribe"],
        provider: "azure",
        publisher: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-08-19").getTime(),
        // Provider retires this route on 2028-02-01.
        paidOnly: false,
        priceMultiplier: 0.75,
        cost: {
            // Provisional OpenAI list price: $0.0045 per input minute. Azure's
            // exact meter was not yet visible when this route launched.
            promptAudioSeconds: 0.0045 / 60,
        },
        title: "GPT Transcribe",
        description:
            "Fast multilingual speech recognition with optional language and prompt context",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/audio/transcriptions"],
    },
    "elevenlabs/scribe-v2": {
        aliases: ["scribe_v2", "scribe-v2", "scribe"],
        provider: "elevenlabs",
        publisher: "ElevenLabs",
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
        supportedEndpoints: ["/v1/audio/transcriptions"],
    },
    "x-ai/grok-transcribe": {
        aliases: ["grok-transcribe"],
        provider: "xai",
        publisher: "xAI",
        category: "audio",
        addedDate: new Date("2026-08-07").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // xAI REST speech-to-text: $0.10/hour.
            promptAudioSeconds: 0.1 / 3600,
        },
        title: "Grok Transcribe",
        description:
            "Fast multilingual speech recognition with word timestamps, speaker labels, and text formatting",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/audio/transcriptions"],
    },
    "google/gemini-3.5-transcribe": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "audio",
        addedDate: new Date("2026-09-26").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Vertex global: published audio-input and text-output rates.
            promptAudioTokens: 2 / 1_000_000,
            completionTextTokens: 12 / 1_000_000,
            // Vertex reports extra text usage with timestamps; no input-text
            // rate is published. Preserve this usage separately from audio.
            promptTextTokens: 0,
        },
        title: "Gemini 3.5 Transcribe",
        description:
            "Speech recognition with word timestamps and speaker labels for up to eight speakers",
        inputModalities: ["audio"],
        outputModalities: ["text"],
        supportedEndpoints: ["/v1/audio/transcriptions"],
    },
    "x-ai/grok-tts": {
        aliases: ["grok-tts"],
        provider: "xai",
        publisher: "xAI",
        category: "audio",
        addedDate: new Date("2026-08-19").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // xAI REST text-to-speech: $15 per 1M input characters.
            completionAudioTokens: 15 / 1_000_000,
        },
        title: "Grok TTS",
        description:
            "Expressive multilingual speech across 28 built-in voices with inline style controls",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...XAI_TTS_VOICES],
        supportedEndpoints: ["/audio/{text}", "/v1/audio/speech"],
    },
    "openai/tts-1": {
        aliases: ["tts-1"],
        provider: "azure",
        publisher: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-09-29").getTime(),
        paidOnly: false,
        priceMultiplier: 1,
        cost: { completionAudioTokens: 15 / 1_000_000 },
        title: "OpenAI TTS",
        description:
            "Low-latency speech synthesis with six voices and six output formats",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
        supportedEndpoints: ["/audio/{text}", "/v1/audio/speech"],
    },
    "openai/tts-1-hd": {
        aliases: ["tts-1-hd"],
        provider: "azure",
        publisher: "OpenAI",
        category: "audio",
        addedDate: new Date("2026-09-29").getTime(),
        paidOnly: false,
        priceMultiplier: 1,
        cost: { completionAudioTokens: 30 / 1_000_000 },
        title: "OpenAI TTS HD",
        description:
            "Higher-quality speech synthesis with six voices and six output formats",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
        supportedEndpoints: ["/audio/{text}", "/v1/audio/speech"],
    },
    "google/gemini-3.8-flash-tts": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "audio",
        addedDate: new Date("2026-09-24").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini Developer API standard pricing through 2026-12-31.
            // https://ai.google.dev/gemini-api/docs/pricing
            promptTextTokens: 0.5 / 1_000_000,
            completionAudioTokens: 9 / 1_000_000,
        },
        priceUnits: { completionAudioTokens: { unit: "token" } },
        title: "Gemini 3.8 Flash TTS",
        description:
            "Expressive, style-steerable speech across 30 voices for creative narration",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...GEMINI_TTS_VOICES],
    },
    "google/gemini-3.8-flash-lite-tts": {
        aliases: [],
        provider: "google",
        publisher: "Google",
        category: "audio",
        addedDate: new Date("2026-09-24").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // Gemini Developer API standard pricing through 2026-12-31.
            // https://ai.google.dev/gemini-api/docs/pricing
            promptTextTokens: 0.5 / 1_000_000,
            completionAudioTokens: 6 / 1_000_000,
        },
        priceUnits: { completionAudioTokens: { unit: "token" } },
        title: "Gemini 3.8 Flash Lite TTS",
        description: "Fast, high-throughput speech across 30 voices",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...GEMINI_TTS_VOICES],
    },
    "assemblyai/universal-2": {
        aliases: ["assemblyai-universal-2", "assemblyai-u2", "universal-2"],
        provider: "assemblyai",
        publisher: "AssemblyAI",
        category: "audio",
        addedDate: new Date("2026-05-02").getTime(),
        priceMultiplier: 1,
        paidOnly: false,
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
                    description:
                        "Applies when response_format is diarized_json.",
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
    },
    "assemblyai/universal-3.5-pro": {
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
        paidOnly: false,
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
                    description:
                        "Applies when response_format is diarized_json.",
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
    },
    "stability-ai/stable-audio-3-medium": {
        aliases: [
            "stable-audio",
            "stability-audio",
            "stable-audio-2.5",
            "stable-audio-3-medium",
            "fal-ai/stable-audio-3/medium",
        ],
        provider: "fal",
        publisher: "Stability AI",
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
        minDuration: 1,
        maxDuration: 380,
    },
    "stability-ai/stable-audio-3": {
        // Distinct from stable-audio-3-medium (fal): this is the larger
        // API-only model served by Stability's direct API. Keep aliases
        // non-overlapping with the medium entry.
        aliases: [
            "stable-audio-large",
            "stable-audio-3-large",
            "stable-audio-3",
        ],
        provider: "stability",
        publisher: "Stability AI",
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
        minDuration: 1,
        maxDuration: 380,
    },
    "fish-audio/s2.1-pro": {
        aliases: ["fish-audio-s2.1-pro"],
        provider: "openrouter",
        publisher: "Fish Audio",
        category: "audio",
        addedDate: new Date("2026-08-19").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // OpenRouter, verified 2026-08-19: $15 per 1M UTF-8 input bytes.
            completionAudioTokens: (15 / 1_000_000) * 1.055,
        },
        priceUnits: { completionAudioTokens: { unit: "byte" } },
        title: "Fish Audio S2.1 Pro",
        description:
            "Multilingual expressive speech with natural-language emotion and delivery control",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "microsoft/mai-voice-2.1": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "audio",
        addedDate: new Date("2026-10-08").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Direct Azure Speech list rate; Vercel matches it, OpenRouter adds 5.5%.
        cost: { completionAudioTokens: 22 / 1_000_000 },
        title: "MAI-Voice-2.1",
        description:
            "Expressive speech across 23 languages with consistent voices for long-form narration; mp3 or 24 kHz pcm",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...MAI_VOICE_21_VOICES],
    },
    "microsoft/mai-voice-2.1-flash": {
        aliases: [],
        provider: "azure",
        publisher: "Microsoft",
        category: "audio",
        addedDate: new Date("2026-10-08").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        // Direct Azure Speech list rate; Vercel matches it, OpenRouter adds 5.5%.
        cost: { completionAudioTokens: 15 / 1_000_000 },
        title: "MAI-Voice-2.1 Flash",
        description:
            "Low-latency expressive speech across 23 languages for voice agents; mp3 or 24 kHz pcm",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...MAI_VOICE_21_VOICES],
    },
    "qwen/qwen3-tts-flash": {
        aliases: ["qwen3-tts", "qwen3-tts-flash", "qwen-tts"],
        provider: "alibaba",
        publisher: "Qwen",
        category: "audio",
        addedDate: new Date("2026-04-22").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        perUserRpm: 60,
        cost: {
            // DashScope Qwen3-TTS-Flash: $0.10 per 10K characters
            completionAudioTokens: 0.01 / 1000,
        },
        title: "Qwen3-TTS Flash",
        description: "Fast multilingual text-to-speech at low cost",
        inputModalities: ["text"],
        outputModalities: ["audio"],
    },
    "qwen/qwen-audio-3.0-tts-flash": {
        // Replaces Qwen3-TTS Instruct Flash, which Alibaba retires on 2026-10-10 (notice 2009).
        aliases: [
            "qwen/qwen3-tts-instruct-flash",
            "qwen3-tts-instruct",
            "qwen3-tts-instruct-flash",
            "qwen-tts-instruct",
        ],
        provider: "alibaba",
        publisher: "Qwen",
        category: "audio",
        addedDate: new Date("2026-10-08").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // DashScope Singapore: $0.15 per 10K characters
            completionAudioTokens: 0.015 / 1000,
        },
        title: "Qwen-Audio 3.0 TTS Flash",
        description:
            "Low-latency speech you can direct with emotion, tone and dialect instructions",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...QWEN_AUDIO_TTS_VOICES],
    },
    "sesame/csm-1b": {
        aliases: ["csm", "sesame-csm", "sesame-csm-1b", "csm-1b"],
        provider: "deepinfra",
        publisher: "Sesame",
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
    "hexgrad/kokoro-82m": {
        aliases: ["kokoro-82m", "kokoro-tts", "hexgrad-kokoro-82m", "kokoro"],
        provider: "deepinfra",
        publisher: "Hexgrad",
        category: "audio",
        addedDate: new Date("2026-07-31").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            // DeepInfra bills hexgrad/Kokoro-82M at $0.62 per 1M input characters.
            completionAudioTokens: 0.62 / 1_000_000,
        },
        title: "Kokoro 82M",
        description:
            "Lightweight multilingual speech across 54 voices and eight languages",
        inputModalities: ["text"],
        outputModalities: ["audio"],
        voices: [...KOKORO_VOICES],
    },
} satisfies Record<string, ModelDefinition>;

export const AUDIO_SERVICES = mergeFallbacks(
    AUDIO_BASE_SERVICES,
    AUDIO_FALLBACKS,
);
export type AudioModelName = keyof typeof AUDIO_SERVICES;

export function resolveElevenLabsVoiceId(voice: string): string {
    return VOICE_MAPPING[voice] ?? voice;
}
