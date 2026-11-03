import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchResponseWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

/** Validate a public HTTPS URL we are allowed to fetch audio from. */
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

async function fetchSourceAudio(source) {
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
    const filename = source.pathname.split("/").pop() || "audio";
    return { blob: await response.blob(), filename };
}

function base64FromBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/**
 * A binary audio response becomes an enclosure resource link when the gateway
 * provides one; otherwise the audio bytes are handed back as an audio block.
 */
async function audioContentResult(response, name) {
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
    const buffer = await response.arrayBuffer();
    return createMCPResponse([
        { type: "audio", data: base64FromBuffer(buffer), mimeType: contentType },
        createTextContent(
            { mimeType: contentType, sizeBytes: buffer.byteLength },
            true,
        ),
    ]);
}

async function isolateAudio({ source, model }, context) {
    const url = publicAudioUrl(source);
    const { blob, filename } = await fetchSourceAudio(url);
    const form = new FormData();
    form.append("file", blob, filename);
    if (model) form.append("model", model);
    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/voice-isolator"),
        { method: "POST", body: form },
        context,
    );
    return audioContentResult(response, "Isolated audio");
}

async function changeVoice({ source, targetVoice, model, response_format }, context) {
    const url = publicAudioUrl(source);
    const { blob, filename } = await fetchSourceAudio(url);
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("voice", targetVoice);
    if (model) form.append("model", model);
    if (response_format) form.append("response_format", response_format);
    const response = await fetchResponseWithAuth(
        buildUrl("/v1/audio/voice-changer"),
        { method: "POST", body: form },
        context,
    );
    return audioContentResult(response, "Voice-changed audio");
}

const tools = [
    [
        "isolateAudio",
        "Remove music and background noise from a public audio or video URL, " +
            "leaving the isolated vocals, and return the audio as a resource link.",
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
        isolateAudio,
    ],
    [
        "changeVoice",
        "Re-speak a spoken audio file from a public HTTPS URL in another voice " +
            "and return the audio as a resource link.",
        {
            source: z
                .url()
                .describe("Direct public HTTPS URL of an audio file"),
            targetVoice: z
                .string()
                .describe(
                    "Preset voice name or voice ID. Use listModels with type=audio for voice metadata",
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

function buildServer() {
    const server = new McpServer(
        { name: "voice-mcp", title: "Voice MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    for (const [name, description, inputSchema, handler] of tools) {
        server.registerTool(
            name,
            { description, inputSchema: z.object(inputSchema) },
            handler,
        );
    }
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
                "WWW-Authenticate": 'Bearer realm="voice-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "voice-mcp",
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