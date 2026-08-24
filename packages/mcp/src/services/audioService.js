import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchAndUploadMedia,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { validateTranscriptionModel } from "../utils/models.js";

const MAX_TRANSCRIPTION_BYTES = 50 * 1024 * 1024;
const TRANSCRIPTION_FETCH_TIMEOUT_MS = 30_000;

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

async function readAudio(response) {
    const contentLength = Number(response.headers.get("content-length"));
    if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_TRANSCRIPTION_BYTES
    ) {
        throw new Error("source exceeds the 50 MB transcription limit");
    }

    const reader = response.body?.getReader();
    if (!reader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
            throw new Error("source exceeds the 50 MB transcription limit");
        }
        return [bytes];
    }

    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_TRANSCRIPTION_BYTES) {
                await reader.cancel();
                throw new Error("source exceeds the 50 MB transcription limit");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return chunks;
}

export async function transcribeAudio(params, context) {
    requireApiKey(context);
    if (params.model) {
        const validation = await validateTranscriptionModel(
            params.model,
            context,
        );
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Use listModels with type=audio for the live registry.`,
            );
        }
    }

    const source = publicAudioUrl(params.source);
    let response;
    try {
        response = await fetch(source, {
            redirect: "error",
            signal: AbortSignal.timeout(TRANSCRIPTION_FETCH_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            "Could not fetch source audio. Use a directly accessible public HTTPS URL.",
        );
    }
    if (!response.ok) {
        throw new Error(`Source returned HTTP ${response.status}`);
    }

    const form = new FormData();
    form.append(
        "file",
        new Blob(await readAudio(response), {
            type: response.headers.get("content-type") || "audio/mpeg",
        }),
        source.pathname.split("/").pop() || "audio",
    );
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
    return createMCPResponse([createTextContent(result.text)]);
}

async function generateAudio(params, context) {
    requireApiKey(context);

    const { text, ...options } = params;
    const { contentType, mediaUrl } = await fetchAndUploadMedia(
        buildUrl(`/audio/${encodeURIComponent(text)}`, options),
        {},
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
            instruct: z
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
                .describe("Direct public HTTPS URL for an audio file up to 50 MB"),
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
                .describe("Optional text to guide transcription style or spelling"),
        },
        transcribeAudio,
    ],
];
