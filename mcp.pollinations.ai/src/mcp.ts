import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Env } from "./types";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type ToolContext = {
    apiKey: string;
    genOrigin: string;
};

function text(value: unknown) {
    return {
        type: "text" as const,
        text:
            typeof value === "string" ? value : JSON.stringify(value, null, 2),
    };
}

function base64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        result += String.fromCharCode(
            ...bytes.subarray(index, index + chunkSize),
        );
    }
    return btoa(result);
}

function apiUrl(context: ToolContext, path: string): URL {
    return new URL(path, context.genOrigin);
}

function buildUrl(
    context: ToolContext,
    path: string,
    params: Record<string, unknown>,
): URL {
    const url = apiUrl(context, path);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }
    return url;
}

async function genFetch(
    context: ToolContext,
    path: string | URL,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${context.apiKey}`);
    const response = await fetch(
        path instanceof URL ? path : apiUrl(context, path),
        { ...init, headers },
    );
    if (!response.ok) {
        const body = await response.text().catch(() => "Unknown error");
        let detail = body;
        try {
            const parsed = JSON.parse(body);
            detail =
                parsed?.error?.message ??
                parsed?.message ??
                parsed?.error ??
                body;
        } catch {}
        throw new Error(`Gen request failed (${response.status}): ${detail}`);
    }
    return response;
}

function audioFilename(url: URL, contentType: string): string {
    const name = decodeURIComponent(url.pathname.split("/").pop() || "audio");
    if (name.includes(".")) return name;
    const extension: Record<string, string> = {
        "audio/flac": "flac",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/webm": "webm",
    };
    return extension[contentType] ? `${name}.${extension[contentType]}` : name;
}

async function downloadAudio(audioUrl: string) {
    const url = new URL(audioUrl);
    if (url.protocol !== "https:") {
        throw new Error("audioUrl must use HTTPS");
    }
    const response = await fetch(url, { redirect: "error" });
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

const messageSchema = z
    .object({
        role: z.string(),
        content: z.unknown().optional(),
    })
    .passthrough();

const chatSchema = z
    .object({
        messages: z.array(messageSchema).min(1),
        model: z.string().optional(),
        temperature: z.number().optional(),
        max_tokens: z.number().optional(),
        tools: z.array(z.unknown()).optional(),
        tool_choice: z.unknown().optional(),
    })
    .passthrough();

const mediaOutput = z.enum(["url", "inline"]).optional();

const imageSchema = z.object({
    prompt: z.string(),
    model: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    seed: z.number().int().optional(),
    guidance_scale: z.number().optional(),
    quality: z.string().optional(),
    image: z.union([z.string(), z.array(z.string())]).optional(),
    transparent: z.boolean().optional(),
    safe: z.union([z.boolean(), z.string()]).optional(),
    output: mediaOutput,
});

const videoSchema = z.object({
    prompt: z.string(),
    model: z.string(),
    duration: z.number().int().optional(),
    aspectRatio: z.string().optional(),
    audio: z.boolean().optional(),
    image: z.union([z.string(), z.array(z.string())]).optional(),
    seed: z.number().int().optional(),
    safe: z.union([z.boolean(), z.string()]).optional(),
    output: mediaOutput,
});

const speechSchema = z.object({
    input: z.string(),
    model: z.string().optional(),
    voice: z.string().optional(),
    response_format: z.string().optional(),
});

const transcriptionSchema = z.object({
    audioUrl: z.string().url(),
    model: z.string().optional(),
    language: z.string().optional(),
    prompt: z.string().optional(),
    response_format: z
        .enum(["json", "text", "srt", "verbose_json", "vtt", "diarized_json"])
        .optional(),
    temperature: z.number().optional(),
    speakers_expected: z.number().int().min(1).optional(),
});

export function createMcpServer(context: ToolContext): McpServer {
    const server = new McpServer(
        { name: "pollinations-mcp", version: "1.0.0" },
        {
            instructions:
                "Use these tools to call Pollinations APIs. Authentication is handled by OAuth and must never be requested as a tool argument.",
        },
    );

    server.registerTool(
        "listModels",
        { description: "Return the live Pollinations model registry." },
        async () => ({
            content: [text(await (await genFetch(context, "/models")).json())],
        }),
    );

    server.registerTool(
        "chatCompletion",
        {
            description: "Call the OpenAI-compatible chat completions API.",
            inputSchema: chatSchema,
        },
        async (params) => ({
            content: [
                text(
                    await (
                        await genFetch(context, "/v1/chat/completions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(params),
                        })
                    ).json(),
                ),
            ],
        }),
    );

    server.registerTool(
        "generateImage",
        {
            description: "Generate an image with the Pollinations image API.",
            inputSchema: imageSchema,
        },
        async ({ prompt, output = "url", ...params }) => {
            const url = buildUrl(
                context,
                `/image/${encodeURIComponent(prompt)}`,
                params,
            );
            const response = await genFetch(context, url);
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.startsWith("image/")) {
                throw new Error(
                    `Expected an image response, received ${contentType}`,
                );
            }
            if (output === "url") {
                await response.body?.cancel();
                return { content: [text(url.toString())] };
            }
            return {
                content: [
                    {
                        type: "image" as const,
                        data: base64(await response.arrayBuffer()),
                        mimeType: contentType,
                    },
                ],
            };
        },
    );

    server.registerTool(
        "generateVideo",
        {
            description: "Generate a video with the Pollinations image API.",
            inputSchema: videoSchema,
        },
        async ({ prompt, output = "url", ...params }) => {
            const url = buildUrl(
                context,
                `/image/${encodeURIComponent(prompt)}`,
                params,
            );
            const response = await genFetch(context, url);
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.startsWith("video/")) {
                throw new Error(
                    `Expected a video response, received ${contentType}`,
                );
            }
            if (output === "url") {
                await response.body?.cancel();
                return { content: [text(url.toString())] };
            }
            return {
                content: [
                    {
                        type: "resource" as const,
                        resource: {
                            uri: `pollinations://video/${crypto.randomUUID()}`,
                            mimeType: contentType,
                            blob: base64(await response.arrayBuffer()),
                        },
                    },
                ],
            };
        },
    );

    server.registerTool(
        "textToSpeech",
        {
            description: "Convert text to speech through the audio API.",
            inputSchema: speechSchema,
        },
        async (params) => {
            const response = await genFetch(context, "/v1/audio/speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(params),
            });
            return {
                content: [
                    {
                        type: "audio" as const,
                        data: base64(await response.arrayBuffer()),
                        mimeType:
                            response.headers.get("content-type") ||
                            "audio/mpeg",
                    },
                ],
            };
        },
    );

    server.registerTool(
        "transcribeAudio",
        {
            description: "Transcribe a public HTTPS audio file.",
            inputSchema: transcriptionSchema,
        },
        async ({ audioUrl, ...params }) => {
            const { blob, filename } = await downloadAudio(audioUrl);
            const form = new FormData();
            form.append("file", blob, filename);
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) form.append(key, String(value));
            }
            const response = await genFetch(
                context,
                "/v1/audio/transcriptions",
                { method: "POST", body: form },
            );
            const contentType = response.headers.get("content-type") || "";
            return {
                content: [
                    text(
                        contentType.includes("application/json")
                            ? await response.json()
                            : await response.text(),
                    ),
                ],
            };
        },
    );

    server.registerTool(
        "getBalance",
        { description: "Return the authenticated key's Pollen balance." },
        async () => ({
            content: [
                text(
                    await (await genFetch(context, "/account/balance")).json(),
                ),
            ],
        }),
    );

    server.registerTool(
        "getUsage",
        {
            description: "Return usage history for the authenticated key.",
            inputSchema: z.object({
                days: z.number().int().optional(),
                limit: z.number().int().optional(),
            }),
        },
        async (params) => ({
            content: [
                text(
                    await (
                        await genFetch(
                            context,
                            buildUrl(context, "/account/key/usage", params),
                        )
                    ).json(),
                ),
            ],
        }),
    );

    return server;
}

export async function handleMcpRequest(
    request: Request,
    env: Env,
    apiKey: string,
): Promise<Response> {
    const server = createMcpServer({ apiKey, genOrigin: env.GEN_ORIGIN });
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
}
