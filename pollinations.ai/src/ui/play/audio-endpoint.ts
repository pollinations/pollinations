const AUDIO_ENDPOINTS = [
    "/v1/audio/transcriptions",
    "/alpha/audio/stem-separation",
    "/v1/audio/voice-changer",
    "/v1/audio/voice-isolator",
    "/v1/audio/speech",
    "/audio/{text}",
] as const;

export function audioEndpoint(model: {
    supportedEndpoints: readonly string[];
}) {
    return AUDIO_ENDPOINTS.find((endpoint) =>
        model.supportedEndpoints.includes(endpoint),
    );
}
