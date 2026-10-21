// Voice catalogs and the default audio model, kept free of catalog access.

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
export function resolveElevenLabsVoiceId(voice: string): string {
    return VOICE_MAPPING[voice] ?? voice;
}
