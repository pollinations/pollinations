import type {
    AudioBinaryResponse,
    ModelInfo,
    Pollinations,
    StemSeparationOptions,
} from "@pollinations/sdk";
import { audioEndpoint } from "./audio-endpoint";

type AudioModel = {
    id: string;
    inputModalities: string[];
    supportedEndpoints: string[];
    audioInputConstraints?: ModelInfo["audio_input_constraints"];
};

export function transcriptionControls(model: AudioModel) {
    const options = model.audioInputConstraints?.transcription_options;
    return {
        language: options?.includes("language") ?? true,
        prompt: options?.includes("prompt") ?? true,
    };
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

export type ReferenceUploads = WeakMap<
    File,
    { url: Promise<string>; expires: number }
>;
// Untagged media has a 30-day retention period from upload.
const mediaLifetime = 30 * 24 * 60 * 60 * 1000;

// Cache the pending upload too, so concurrent requests share it. Failed uploads can be retried.
export function uploadReference(
    client: Pollinations,
    file: File,
    urls?: ReferenceUploads,
) {
    const previous = urls?.get(file);
    if (previous && previous.expires > Date.now()) return previous.url;
    const upload = client.upload(file, { name: file.name }).then(
        (result) => result.url,
        (error: unknown) => {
            urls?.delete(file);
            throw error;
        },
    );
    urls?.set(file, { url: upload, expires: Date.now() + mediaLifetime });
    return upload;
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
        referenceUrls,
        voice,
        duration,
        language,
        stemVariationId,
    }: {
        prompt: string;
        file?: File;
        referenceUrls?: ReferenceUploads;
        voice?: string;
        duration?: number;
        language?: string;
        stemVariationId?: StemSeparationOptions["stemVariationId"];
    },
): Promise<
    | { type: "text"; text: string }
    | { type: "stems"; archive: Blob }
    | ({ type: "audio" } & AudioBinaryResponse)
> {
    const endpoint = audioEndpoint(model);
    if (endpoint === "/v1/audio/transcriptions" && file) {
        const controls = transcriptionControls(model);
        const result = await client.transcribe(file, {
            model: model.id,
            prompt: controls.prompt ? prompt.trim() || undefined : undefined,
            language: controls.language
                ? language?.trim() || undefined
                : undefined,
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
    if (endpoint === "/alpha/audio/stem-separation" && file) {
        return {
            type: "stems",
            archive: await client.separateStems(file, {
                model: model.id,
                stemVariationId,
            }),
        };
    }
    const options = {
        model: model.id,
        voice,
        duration,
        [file && isVideo(file) ? "referenceVideo" : "referenceAudio"]: file
            ? await uploadReference(client, file, referenceUrls)
            : undefined,
    };
    const result =
        endpoint === "/audio/{text}"
            ? await client.audio(prompt.trim(), options)
            : await client.audioSpeech(prompt.trim(), options);
    return { type: "audio", ...result };
}

type AudioConstraints = NonNullable<ModelInfo["audio_input_constraints"]>;

export function audioConstraintError(
    rules: AudioConstraints | undefined,
    files: File[],
    durations: ReadonlyMap<File, number | null>,
    hasVisual: boolean,
) {
    if (!rules || !files.length) return null;
    if (rules.requires_reference_visual && !hasVisual)
        return "Add a reference image or video with the audio.";
    if (!rules.min_seconds && !rules.max_seconds && !rules.max_total_seconds)
        return null;
    let total = 0;
    for (const file of files) {
        const seconds = durations.get(file);
        if (seconds === undefined) return "Reading clip duration…";
        // The API can decode formats the browser cannot preview.
        if (seconds === null) continue;
        if (rules.min_seconds && seconds < rules.min_seconds)
            return `${file.name} must be at least ${rules.min_seconds} seconds long.`;
        if (rules.max_seconds && seconds > rules.max_seconds)
            return `${file.name} must be at most ${rules.max_seconds} seconds long.`;
        total += seconds;
    }
    return rules.max_total_seconds && total > rules.max_total_seconds
        ? `Use at most ${rules.max_total_seconds} seconds of audio in total.`
        : null;
}
