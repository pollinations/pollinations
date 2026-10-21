// Voices offered by text models with audio output, and the default text model.

export const AUDIO_VOICES = [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
    "coral",
    "verse",
    "ballad",
    "ash",
    "sage",
    "amuch",
    "dan",
] as const;

export const DEFAULT_TEXT_MODEL = "openai/gpt-5.4-nano" as const;
