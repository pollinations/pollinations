import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    arrayBufferToBase64,
    createAudioContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
    fetchWithAuth,
    parseApiError,
} from "../utils/coreUtils.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

async function textToSpeech(params) {
    requireApiKey();

    const { input, model, voice, response_format } = params;
    const body = { input, model, voice, response_format };
    const { buffer, contentType } = await fetchBinaryWithAuth(
        `${API_BASE_URL}/v1/audio/speech`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                Object.fromEntries(
                    Object.entries(body).filter(([, value]) => value != null),
                ),
            ),
            timeoutMs: 300000,
        },
    );

    return createMCPResponse([
        createAudioContent(arrayBufferToBase64(buffer), contentType),
    ]);
}

function audioFilename(url, contentType) {
    const name = decodeURIComponent(url.pathname.split("/").pop() || "audio");
    if (name.includes(".")) return name;
    const extension = {
        "audio/flac": "flac",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/webm": "webm",
    }[contentType];
    return extension ? `${name}.${extension}` : name;
}

function isPrivateAddress(address) {
    if (isIP(address) === 4) {
        const [a, b] = address.split(".").map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) ||
            a >= 224
        );
    }
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(
        /(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (mappedIpv4) {
        const [high, low] = mappedIpv4
            .slice(1)
            .map((part) => Number.parseInt(part, 16));
        return isPrivateAddress(
            `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
        );
    }
    return (
        normalized === "::" ||
        normalized === "::1" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        /^fe[89ab]/.test(normalized)
    );
}

async function validateAudioUrl(url) {
    if (url.protocol !== "https:") {
        throw new Error("audioUrl must use HTTPS");
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
    ) {
        throw new Error("audioUrl must use a public host");
    }
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error("audioUrl resolved to a private address");
    }
}

async function downloadAudio(audioUrl) {
    const url = new URL(audioUrl);
    await validateAudioUrl(url);

    const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
        throw new Error(`Failed to download audio (${response.status})`);
    }
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_AUDIO_BYTES) {
        throw new Error("Audio file exceeds the 25 MiB limit");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_AUDIO_BYTES) {
        throw new Error("Audio file exceeds the 25 MiB limit");
    }

    const contentType =
        response.headers.get("content-type")?.split(";")[0] ||
        "application/octet-stream";
    return {
        blob: new Blob([buffer], { type: contentType }),
        filename: audioFilename(url, contentType),
    };
}

async function transcribeAudio(params) {
    requireApiKey();

    const {
        audioUrl,
        model,
        language,
        prompt,
        response_format,
        temperature,
        speakers_expected,
    } = params;
    const { blob, filename } = await downloadAudio(audioUrl);
    const formData = new FormData();
    formData.append("file", blob, filename);

    for (const [key, value] of Object.entries({
        model,
        language,
        prompt,
        response_format,
        temperature,
        speakers_expected,
    })) {
        if (value != null) formData.append(key, String(value));
    }

    const response = await fetchWithAuth(
        `${API_BASE_URL}/v1/audio/transcriptions`,
        { method: "POST", body: formData, timeoutMs: 300000 },
    );
    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(parseApiError(response.status, errorText));
    }

    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    return createMCPResponse([
        createTextContent(result, typeof result !== "string"),
    ]);
}

export const audioTools = [
    [
        "textToSpeech",
        "Convert text to speech through Gen's OpenAI-compatible audio endpoint.",
        {
            input: z.string().describe("Text to speak verbatim"),
            model: z
                .string()
                .optional()
                .describe("TTS model; omit to use the Gen default"),
            voice: z
                .string()
                .optional()
                .describe("Voice name or provider voice ID; use listModels"),
            response_format: z
                .string()
                .optional()
                .describe("Audio format such as mp3, wav, flac, opus, or pcm"),
        },
        textToSpeech,
    ],
    [
        "transcribeAudio",
        "Download an HTTPS audio file and transcribe it through Gen's OpenAI-compatible transcription endpoint.",
        {
            audioUrl: z.string().url().describe("Public HTTPS audio file URL"),
            model: z
                .string()
                .optional()
                .describe("STT model; omit to use the Gen default"),
            language: z.string().optional().describe("ISO-639-1 language hint"),
            prompt: z.string().optional().describe("Transcription prompt"),
            response_format: z
                .enum([
                    "json",
                    "text",
                    "srt",
                    "verbose_json",
                    "vtt",
                    "diarized_json",
                ])
                .optional(),
            temperature: z.number().optional(),
            speakers_expected: z.number().int().min(1).optional(),
        },
        transcribeAudio,
    ],
];
