import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
    fetchMediaLink,
    fetchResponseWithAuth,
} from "../utils/coreUtils.js";

function publicAudioUrl(source) {
    let url;
    try {
        url = new URL(source);
    } catch {
        throw new Error("source must be a valid public HTTPS URL");
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isIpAddress =
        hostname.includes(":") ||
        (hostname.split(".").length === 4 &&
            hostname
                .split(".")
                .every((part) => /^\d+$/.test(part) && Number(part) <= 255));
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        isIpAddress
    ) {
        throw new Error(
            "source must be a public HTTPS URL without credentials or an IP address",
        );
    }
    return url;
}

/** Fetch the audio bytes we were asked to process from a validated public URL. */
async function fetchPublicAudio(source) {
    let response;
    try {
        // Workers reject redirect: "error"; use "manual" and refuse 3xx below.
        response = await fetch(source, {
            redirect: "manual",
        });
    } catch {
        throw new Error(
            "Could not fetch source audio. Use a directly accessible public HTTPS URL.",
        );
    }
    if (
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400)
    ) {
        await response.body?.cancel();
        throw new Error(
            "Source audio URL redirects. Use the final, directly accessible HTTPS URL.",
        );
    }
    if (!response.ok) {
        throw new Error(`Source returned HTTP ${response.status}`);
    }
    return {
        blob: await response.blob(),
        filename: source.pathname.split("/").pop() || "audio",
    };
}

/**
 * Audio the gateway stored comes back as its enclosure link. Without one, hand
 * the bytes back as an audio block instead of dropping the result.
 */
async function audioResult(response, name) {
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const mediaUrl = response.headers
        .get("Link")
        ?.match(/^<([^>]+)>; rel="enclosure"$/)?.[1];
    if (mediaUrl) {
        await response.body?.cancel();
        return createMCPResponse([
            {
                type: "resource_link",
                uri: mediaUrl,
                name,
                mimeType: contentType,
            },
            createTextContent({ url: mediaUrl, mimeType: contentType }, true),
        ]);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return createMCPResponse([
        { type: "audio", data: btoa(binary), mimeType: contentType },
        createTextContent(
            { mimeType: contentType, sizeBytes: bytes.length },
            true,
        ),
    ]);
}

export async function transcribeAudio(params, context) {
    requireApiKey(context);
    const { blob, filename } = await fetchPublicAudio(
        publicAudioUrl(params.source),
    );

    const form = new FormData();
    form.append("file", blob, filename);
    if (params.model) form.append("model", params.model);
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);

    const result = await fetchJsonWithAuth(
        buildUrl("/v1/audio/transcriptions"),
        { method: "POST", body: form },
        context,
    );
    if (typeof result?.text !== "string") {
        throw new Error("Transcription returned no text");
    }
    return createMCPResponse([
        createTextContent(result.text),
        createTextContent({ usage: result.usage }, true),
    ]);
}

export async function isolateVocals({ source, model }, context) {
    requireApiKey(context);
    const { blob, filename } = await fetchPublicAudio(publicAudioUrl(source));

    const form = new FormData();
    form.append("file", blob, filename);
    if (model) form.append("model", model);

    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/voice-isolator"),
        { method: "POST", body: form },
        context,
    );
    return audioResult(response, "Isolated vocals");
}

export async function changeVoice(
    { source, voice, model, response_format },
    context,
) {
    requireApiKey(context);
    const { blob, filename } = await fetchPublicAudio(publicAudioUrl(source));

    const form = new FormData();
    form.append("file", blob, filename);
    form.append("voice", voice);
    if (model) form.append("model", model);
    if (response_format) form.append("response_format", response_format);

    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/voice-changer"),
        { method: "POST", body: form },
        context,
    );
    return audioResult(response, "Voice-changed audio");
}

async function generateAudio(params, context) {
    requireApiKey(context);

    const { text, ...options } = params;
    const { contentType, mediaUrl } = await fetchMediaLink(
        buildUrl(`/audio/${encodeURIComponent(text)}`, options),
        context,
    );
    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "Generated audio",
            mimeType: contentType,
        },
        createTextContent(
            { url: mediaUrl, text, ...options, mimeType: contentType },
            true,
        ),
    ]);
}

export const audioTools = [
    [
        "generateAudio",
        "Generate speech, music, or sound and return an unlisted media.pollinations.ai resource link.",
        {
            text: z
                .string()
                .min(1)
                .describe("Text to speak or a music/sound description"),
            voice: z
                .string()
                .optional()
                .describe(
                    "Voice for speech generation. Use listModels with type=audio for voice metadata",
                ),
            response_format: z
                .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
                .optional()
                .describe("Audio output format (default: mp3)"),
            model: z
                .string()
                .optional()
                .describe("Audio model. Use listModels with type=audio"),
            duration: z
                .number()
                .optional()
                .describe("Duration in seconds where supported"),
            seconds: z
                .number()
                .min(1)
                .max(380)
                .optional()
                .describe("Duration for stable-audio models"),
            steps: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .describe("Sampling steps for stable-audio models"),
            negative_prompt: z
                .string()
                .optional()
                .describe("Negative prompt for stable-audio models"),
            instrumental: z
                .boolean()
                .optional()
                .describe("Generate instrumental music where supported"),
            instructions: z
                .string()
                .optional()
                .describe("Emotion or style instruction where supported"),
            loop: z
                .boolean()
                .optional()
                .describe("Loop the generated sound effect where supported"),
            prompt_influence: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Prompt influence for sound effects"),
            seed: z.number().int().optional().describe("Random seed"),
            safe: z
                .union([z.string(), z.boolean()])
                .optional()
                .describe("Pollinations safety options"),
        },
        generateAudio,
    ],
    [
        "transcribeAudio",
        "Transcribe spoken audio from a public HTTPS URL. Use listModels with type=audio for transcription models.",
        {
            source: z
                .url()
                .describe("Direct public HTTPS URL for an audio file"),
            model: z
                .string()
                .optional()
                .describe(
                    "Transcription model. Use listModels with type=audio for the live list",
                ),
            language: z
                .string()
                .optional()
                .describe("Optional ISO-639-1 language hint, such as en or fr"),
            prompt: z
                .string()
                .optional()
                .describe(
                    "Optional text to guide transcription style or spelling",
                ),
        },
        transcribeAudio,
    ],
    [
        "isolateVocals",
        "Remove music and background noise from a public audio or video URL, leaving the isolated vocals, and return the audio as a resource link.",
        {
            source: z
                .url()
                .describe("Direct public HTTPS URL of an audio or video file"),
            model: z
                .string()
                .optional()
                .describe(
                    "Voice-isolation model. Use listModels with type=audio for the live list",
                ),
        },
        isolateVocals,
    ],
    [
        "changeVoice",
        "Re-speak spoken audio from a public HTTPS URL in another voice and return the audio as a resource link.",
        {
            source: z
                .url()
                .describe("Direct public HTTPS URL of an audio file"),
            voice: z
                .string()
                .describe(
                    "Target voice name or voice ID. Use listModels with type=audio for voice metadata",
                ),
            model: z
                .string()
                .optional()
                .describe(
                    "Voice-change model. Use listModels with type=audio for the live list",
                ),
            response_format: z
                .enum(["mp3", "opus", "aac", "wav", "pcm"])
                .optional()
                .describe("Audio output format (default: mp3)"),
        },
        changeVoice,
    ],
];
