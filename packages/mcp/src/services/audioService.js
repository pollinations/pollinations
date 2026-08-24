import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    arrayBufferToBase64,
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchResponseWithAuth,
} from "../utils/coreUtils.js";
import { fetchGeneratedMedia } from "../utils/mediaUtils.js";

async function generateAudio(params, context) {
    const { text, output, ...options } = params;
    const url = buildUrl(`/audio/${encodeURIComponent(text)}`, options);
    const { data, contentType } = await fetchGeneratedMedia(
        url,
        { expectedType: "audio", output, timeoutMs: 600000 },
        context,
    );
    if (data === undefined) {
        return createMCPResponse([createTextContent(url)]);
    }
    return createMCPResponse([{ type: "audio", data, mimeType: contentType }]);
}

async function textToSpeech(params, context) {
    requireApiKey(context);
    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/speech"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            timeoutMs: 300000,
        },
        context,
    );
    return createMCPResponse([
        {
            type: "audio",
            data: arrayBufferToBase64(await response.arrayBuffer()),
            mimeType:
                response.headers.get("content-type") ||
                "application/octet-stream",
        },
    ]);
}

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
    const { source: sourceValue, ...requestParams } = params;
    const source = publicAudioUrl(sourceValue);
    let sourceResponse;
    try {
        sourceResponse = await fetch(source, {
            redirect: "error",
            signal: AbortSignal.timeout(60000),
        });
    } catch {
        throw new Error(
            "Could not fetch source audio. Use a directly accessible public HTTPS URL.",
        );
    }
    if (!sourceResponse.ok) {
        throw new Error(`Source returned HTTP ${sourceResponse.status}`);
    }

    const form = new FormData();
    form.append(
        "file",
        await sourceResponse.blob(),
        source.pathname.split("/").pop() || "audio",
    );
    for (const [key, value] of Object.entries(requestParams)) {
        if (value !== undefined && value !== null) {
            form.append(key, String(value));
        }
    }

    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/transcriptions"),
        { method: "POST", body: form, timeoutMs: 300000 },
        context,
    );
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return createMCPResponse([
            createTextContent(await response.json(), true),
        ]);
    }
    return createMCPResponse([createTextContent(await response.text())]);
}

export const audioTools = [
    [
        "generateAudio",
        "Generate speech, music, or sound and return its Gen URL or inline MCP audio.",
        z
            .object({
                text: z.string().min(1),
                model: z
                    .string()
                    .optional()
                    .describe("Audio model; use listModels"),
                output: z.enum(["url", "inline"]).optional(),
            })
            .passthrough(),
        generateAudio,
    ],
    [
        "textToSpeech",
        "Convert text to speech through Gen's OpenAI-compatible audio endpoint.",
        z
            .object({
                input: z.string().min(1),
                model: z
                    .string()
                    .optional()
                    .describe("TTS model; omit for the Gen default"),
                voice: z.string().optional(),
                response_format: z.string().optional(),
            })
            .passthrough(),
        textToSpeech,
    ],
    [
        "transcribeAudio",
        "Download a public HTTPS audio file and proxy it to Gen's OpenAI-compatible transcription endpoint.",
        z
            .object({
                source: z.url().describe("Direct public HTTPS audio URL"),
                model: z
                    .string()
                    .optional()
                    .describe("STT model; omit for the Gen default"),
                language: z.string().optional(),
                prompt: z.string().optional(),
                response_format: z.string().optional(),
            })
            .passthrough(),
        transcribeAudio,
    ],
];
