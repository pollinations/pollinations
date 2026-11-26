export const audioTaskGroups = {
    "speech-generation": "Speech",
    transcription: "Transcribe",
    "music-and-sound-effects": "Music",
    "voice-changer": "Tools",
    "voice-isolator": "Tools",
    "stem-separation": "Tools",
} as const;

type AudioTaskId = keyof typeof audioTaskGroups;
export const audioTaskIds = Object.keys(audioTaskGroups) as AudioTaskId[];

// Prefer specialist routes, then OpenAI-compatible speech, then the simplified route.
const audioRoutes = [
    ["/v1/audio/transcriptions", ["transcription"]],
    ["/alpha/audio/stem-separation", ["stem-separation"]],
    ["/v1/audio/voice-changer", ["voice-changer"]],
    ["/v1/audio/voice-isolator", ["voice-isolator"]],
    ["/v1/audio/speech", ["speech-generation", "music-and-sound-effects"]],
    ["/audio/{text}", ["speech-generation", "music-and-sound-effects"]],
] as const satisfies readonly (readonly [string, readonly AudioTaskId[]])[];

export function audioRoute(model: { supportedEndpoints: readonly string[] }) {
    return audioRoutes.find(([endpoint]) =>
        model.supportedEndpoints.includes(endpoint),
    );
}

export function audioEndpoint(model: {
    supportedEndpoints: readonly string[];
}) {
    return audioRoute(model)?.[0];
}
