import type { AudioBinaryResponse, Pollinations } from "@pollinations/sdk";

type AudioModel = {
    id: string;
    inputModalities: string[];
    supportedEndpoints: string[];
};

const AUDIO_ENDPOINTS = [
    "/v1/audio/transcriptions",
    "/v1/audio/voice-changer",
    "/v1/audio/voice-isolator",
    "/v1/audio/speech",
    "/audio/{text}",
] as const;

export function audioEndpoint(model: AudioModel) {
    return AUDIO_ENDPOINTS.find((endpoint) =>
        model.supportedEndpoints.includes(endpoint),
    );
}

export function audioInputError(
    model: AudioModel,
    prompt: string,
    file?: File,
): string | null {
    const endpoint = audioEndpoint(model);
    if (!endpoint) return "This audio endpoint is not supported in Play yet.";
    const generatesAudio =
        endpoint === "/v1/audio/speech" || endpoint === "/audio/{text}";
    if (!generatesAudio && !file)
        return model.inputModalities.includes("video")
            ? "Upload an audio or video file first."
            : "Upload an audio file first.";
    if (generatesAudio && !prompt.trim())
        return "Add text or a description first.";
    if (generatesAudio && file && !model.inputModalities.includes("audio")) {
        return "This model does not accept reference audio.";
    }
    return null;
}

/** Use the catalog's endpoint contract; never discard a selected file. */
export async function generatePlaygroundAudio(
    client: Pollinations,
    model: AudioModel,
    { prompt, file, voice }: { prompt: string; file?: File; voice?: string },
): Promise<
    { type: "text"; text: string } | ({ type: "audio" } & AudioBinaryResponse)
> {
    const error = audioInputError(model, prompt, file);
    if (error) throw new Error(error);
    const endpoint = audioEndpoint(model);
    if (endpoint === "/v1/audio/transcriptions" && file) {
        const result = await client.transcribe(file, {
            model: model.id,
            prompt: prompt.trim() || undefined,
        });
        return { type: "text", text: result.text || "No transcript" };
    }
    if (
        (endpoint === "/v1/audio/voice-changer" ||
            endpoint === "/v1/audio/voice-isolator") &&
        file
    ) {
        const result = await client.audioTransform(file, {
            operation:
                endpoint === "/v1/audio/voice-changer"
                    ? "voice-changer"
                    : "voice-isolator",
            model: model.id,
            voice,
        });
        return { type: "audio", ...result };
    }
    const upload = file
        ? await client.upload(file, { name: file.name })
        : undefined;
    const options = { model: model.id, voice, referenceAudio: upload?.url };
    const result =
        endpoint === "/audio/{text}"
            ? await client.audio(prompt.trim(), options)
            : await client.audioSpeech(prompt.trim(), options);
    return { type: "audio", ...result };
}
