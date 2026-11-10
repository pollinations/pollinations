import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
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

export async function transcribeAudio(params, context) {
    requireApiKey(context);
    const source = publicAudioUrl(params.source);
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

    const form = new FormData();
    form.append(
        "file",
        await response.blob(),
        source.pathname.split("/").pop() || "audio",
    );
    if (params.model) form.append("model", params.model);
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);
    if (params.response_format) {
        form.append("response_format", params.response_format);
    }
    if (params.temperature !== undefined) {
        form.append("temperature", String(params.temperature));
    }
    if (params.speakers_expected !== undefined) {
        form.append("speakers_expected", String(params.speakers_expected));
    }

    response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/transcriptions"),
        { method: "POST", body: form },
        context,
    );

    // Every format but plain json passes through untouched: text, srt and vtt
    // are not JSON, and gen's verbose_json and diarized_json carry segments,
    // speakers and usage next to `text`.
    if (params.response_format && params.response_format !== "json") {
        return createMCPResponse([createTextContent(await response.text())]);
    }

    const result = await response.json();
    if (typeof result?.text !== "string") {
        throw new Error("Transcription returned no text");
    }
    return createMCPResponse([
        createTextContent(result.text),
        createTextContent({ usage: result.usage }, true),
    ]);
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
            response_format: z
                .enum([
                    "json",
                    "text",
                    "srt",
                    "verbose_json",
                    "vtt",
                    "diarized_json",
                ])
                .optional()
                .describe(
                    "Transcript format (default: json). srt, vtt and text return plain text; diarized_json needs a diarization-capable model",
                ),
            temperature: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Sampling temperature, 0 to 1"),
            speakers_expected: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    "Number of speakers, only used with response_format=diarized_json",
                ),
        },
        transcribeAudio,
    ],
];
