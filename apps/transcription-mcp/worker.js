import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { readResponseBytes } from "../../shared/response-bytes.ts";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;

class TranscriptionFailure extends Error {}

function publicHttpsUrl(value) {
    const validation = validateUserMediaUrl(value);
    if (!validation.ok || validation.url.protocol !== "https:") {
        throw new TranscriptionFailure("Source must be a public HTTPS URL");
    }
    return validation.url;
}

async function fetchAudio(source, fetchImpl) {
    let url = publicHttpsUrl(source);
    let response;
    for (let redirects = 0; ; redirects += 1) {
        response = await fetchImpl(url, { redirect: "manual" });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get("location");
        if (!location || redirects >= MAX_REDIRECTS) {
            throw new TranscriptionFailure("Source has an invalid redirect");
        }
        await response.body?.cancel();
        url = publicHttpsUrl(new URL(location, url).toString());
    }
    if (!response.ok) {
        throw new TranscriptionFailure(
            `Source returned HTTP ${response.status}`,
        );
    }
    const bytes = await readResponseBytes(
        response,
        MAX_AUDIO_BYTES,
        () => new TranscriptionFailure("Source exceeds 50 MB"),
    );
    if (bytes.byteLength === 0) {
        throw new TranscriptionFailure("Source has an invalid size");
    }
    return {
        bytes,
        contentType: response.headers.get("content-type") ?? "audio/mpeg",
        fileName: url.pathname.split("/").pop() || "audio",
    };
}

async function transcribeAudio(params, env, authorization, fetchImpl) {
    const audio = await fetchAudio(params.source, fetchImpl);
    const form = new FormData();
    form.append(
        "file",
        new Blob([audio.bytes], { type: audio.contentType }),
        audio.fileName,
    );
    form.append("model", params.model);
    form.append("response_format", "json");
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);

    const response = await fetchImpl(
        `${env.POLLINATIONS_BASE_URL}/v1/audio/transcriptions`,
        {
            method: "POST",
            headers: { Authorization: authorization },
            body: form,
        },
    );
    if (!response.ok) {
        const body = await response.text();
        throw new TranscriptionFailure(
            body.slice(0, 1000) ||
                `Transcription returned HTTP ${response.status}`,
        );
    }
    const result = await response.json();
    if (typeof result?.text !== "string") {
        throw new TranscriptionFailure("Transcription returned no text");
    }
    return {
        content: [{ type: "text", text: result.text }],
    };
}

const sourceSchema = z.url().refine((value) => {
    const validation = validateUserMediaUrl(value);
    return validation.ok && validation.url.protocol === "https:";
}, "source must be a public HTTPS URL without credentials");

function buildServer(env, authorization, fetchImpl) {
    const server = new McpServer(
        { name: "pollinations-transcription-mcp", version: "0.1.0" },
        {
            instructions:
                "Transcribe spoken audio from public HTTPS media. Use transcribeAudio when an agent needs speech converted to text.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "transcribeAudio",
        {
            description:
                "Transcribe up to 50 MB of public HTTPS audio with a Pollinations speech-recognition model. Billed through the normal audio API in Pollen.",
            inputSchema: z.object({
                source: sourceSchema,
                model: z.string().optional().default("whisper-large-v3"),
                language: z.string().optional(),
                prompt: z.string().optional(),
            }),
        },
        (params) => transcribeAudio(params, env, authorization, fetchImpl),
    );
    return server;
}

export function createWorker({ fetchImpl = fetch } = {}) {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
            if (
                request.method === "POST" &&
                Array.isArray(
                    await request
                        .clone()
                        .json()
                        .catch(() => null),
                )
            ) {
                return Response.json(
                    {
                        error: "invalid_request",
                        message: "Batch requests are not supported.",
                    },
                    { status: 400 },
                );
            }
            const authorization = request.headers.get("authorization") ?? "";
            const handler = createMcpHandler(
                () => buildServer(env, authorization, fetchImpl),
                {
                    onerror: (error) => console.error(error),
                },
            );
            return handler.fetch(request);
        },
    };
}

export default createWorker();
