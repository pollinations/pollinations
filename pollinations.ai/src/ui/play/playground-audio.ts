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

export function supportsAudioLength(model: {
    id: string;
    allowedDurations: number[];
}) {
    // Lyria 3.5 takes approximate length in the prompt and Sonilo follows its
    // video. Fixed-length models choose their only duration when omitted.
    return (
        model.id !== "google/lyria-3.5" &&
        model.id !== "sonilo/sonilo-1.1-sfx" &&
        model.allowedDurations.length !== 1
    );
}

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv"];

// Some browsers leave `type` empty (e.g. .mkv), so fall back to the extension.
export const isVideo = (file: File) =>
    file.type
        ? file.type.startsWith("video/")
        : VIDEO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

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
    if (
        generatesAudio &&
        !file &&
        model.inputModalities.includes("video") &&
        !model.inputModalities.includes("audio")
    )
        return "Upload a video first.";
    const kind = file && isVideo(file) ? "video" : "audio";
    if (generatesAudio && file && !model.inputModalities.includes(kind))
        return `This model does not accept reference ${kind}.`;
    return null;
}

/**
 * Use the catalog's endpoint contract; never discard a selected file.
 * Callers check audioInputError first.
 */
export async function generatePlaygroundAudio(
    client: Pollinations,
    model: AudioModel,
    {
        prompt,
        file,
        voice,
        duration,
        language,
    }: {
        prompt: string;
        file?: File;
        voice?: string;
        duration?: number;
        language?: string;
    },
): Promise<
    { type: "text"; text: string } | ({ type: "audio" } & AudioBinaryResponse)
> {
    const endpoint = audioEndpoint(model);
    if (endpoint === "/v1/audio/transcriptions" && file) {
        const result = await client.transcribe(file, {
            model: model.id,
            prompt: prompt.trim() || undefined,
            language,
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
    const options = {
        model: model.id,
        voice,
        duration,
        [file && isVideo(file) ? "referenceVideo" : "referenceAudio"]:
            upload?.url,
    };
    const result =
        endpoint === "/audio/{text}"
            ? await client.audio(prompt.trim(), options)
            : await client.audioSpeech(prompt.trim(), options);
    return { type: "audio", ...result };
}
