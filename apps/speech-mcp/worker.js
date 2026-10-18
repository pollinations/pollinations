import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
    fetchResponseWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Max upload size accepted by POST /v1/audio/transcriptions.
const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

const FORMAT_MIME_TYPES = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/pcm",
};

/**
 * Decodes a base64 string or `data:<mime>;base64,...` URI into bytes.
 * Rejects input that does not decode, so a bad tool call fails before the
 * request is billed.
 */
function decodeAudio(value) {
    let data = value.trim().replace(/\s+/g, "");
    let mimeType = null;
    const dataUri = data.match(/^data:([^;,]+);base64,(.*)$/s);
    if (dataUri) {
        mimeType = dataUri[1];
        data = dataUri[2];
    } else if (data.startsWith("data:")) {
        throw new Error("Audio data URI must be base64-encoded.");
    }
    if (
        !data ||
        data.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    ) {
        throw new Error("Audio must be base64-encoded bytes.");
    }
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length) {
        throw new Error("Audio decodes to zero bytes.");
    }
    if (bytes.length > MAX_TRANSCRIBE_BYTES) {
        throw new Error(
            `Audio is too large: ${bytes.length} bytes, limit is ${MAX_TRANSCRIBE_BYTES}.`,
        );
    }
    return { bytes, mimeType };
}

function buildServer() {
    const server = new McpServer(
        { name: "speech-mcp", title: "Speech MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "text_to_speech",
        {
            description:
                "Speak text aloud: returns generated audio from a Pollinations speech model, " +
                "billed to the caller's key at the model's listed rate. " +
                'Pick voices and models with list_speech_models; the default voice is "alloy".',
            inputSchema: z.object({
                input: z
                    .string()
                    .min(1)
                    .max(10000)
                    .describe("Text to synthesize, 1-10000 characters."),
                voice: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe('Voice name from list_speech_models, default "alloy".'),
                model: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe("Speech model id from list_speech_models."),
                response_format: z
                    .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
                    .optional()
                    .describe("Output encoding, default mp3."),
                instructions: z
                    .string()
                    .min(1)
                    .max(1000)
                    .optional()
                    .describe(
                        "Emotion or style instruction, for models that support it.",
                    ),
            }),
        },
        async (args, context) => {
            const response = await fetchResponseWithAuth(
                buildUrl("/v1/audio/speech"),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(args),
                },
                context,
            );
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                const payload = await response.json();
                return createMCPResponse([
                    createTextContent(payload, true),
                ]);
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!bytes.length) {
                throw new Error("Speech endpoint returned no audio.");
            }
            const headerType = contentType.split(";")[0].trim();
            const mimeType = headerType.startsWith("audio/")
                ? headerType
                : FORMAT_MIME_TYPES[args.response_format || "mp3"];
            return createMCPResponse([
                {
                    type: "audio",
                    data: bytes.toString("base64"),
                    mimeType,
                },
            ]);
        },
    );
    server.registerTool(
        "transcribe",
        {
            description:
                "Turn speech into text: transcribes an audio file with a Pollinations transcription " +
                "model, billed to the caller's key at the model's listed rate. " +
                "Pass base64 bytes or a data: URI; mp3, mp4, mpeg, mpga, m4a, wav and webm are supported.",
            inputSchema: z.object({
                audio: z
                    .string()
                    .min(4)
                    .describe("Base64 audio bytes or a data:<mime>;base64,... URI, up to 25 MB."),
                filename: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe('Filename hint for the upload, default "audio.mp3".'),
                model: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe("Transcription model id from list_speech_models."),
                language: z
                    .string()
                    .min(2)
                    .max(8)
                    .optional()
                    .describe("ISO-639-1 language code of the audio, e.g. en, fr."),
                prompt: z
                    .string()
                    .min(1)
                    .max(1000)
                    .optional()
                    .describe("Hint text to guide the model's style or vocabulary."),
                response_format: z
                    .enum(["json", "verbose_json", "text", "srt", "vtt"])
                    .optional()
                    .describe("Transcript format, default json. Support is model-dependent."),
            }),
        },
        async ({ audio, filename, model, language, prompt, response_format }, context) => {
            const { bytes, mimeType } = decodeAudio(audio);
            const form = new FormData();
            form.append(
                "file",
                new Blob([bytes], { type: mimeType || "audio/mpeg" }),
                filename || "audio.mp3",
            );
            for (const [field, value] of Object.entries({
                model,
                language,
                prompt,
                response_format,
            })) {
                if (value !== undefined) form.append(field, value);
            }
            const response = await fetchResponseWithAuth(
                buildUrl("/v1/audio/transcriptions"),
                { method: "POST", body: form },
                context,
            );
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                return createMCPResponse([
                    createTextContent(await response.json(), true),
                ]);
            }
            return createMCPResponse([
                createTextContent(await response.text()),
            ]);
        },
    );
    server.registerTool(
        "list_speech_models",
        {
            description:
                "List the Pollinations audio models: speech (with their voices), music, and " +
                "transcription, with endpoints, prices, and health.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const models = await fetchJsonWithAuth(
                buildUrl("/audio/models"),
                {},
                context,
            );
            return createMCPResponse([createTextContent(models, true)]);
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="speech-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "speech-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

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

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};