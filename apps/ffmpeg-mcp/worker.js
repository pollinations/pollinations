import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    FFMPEG_COST_PER_SECOND,
    FFMPEG_MAX_MEDIA_BYTES,
    FFMPEG_MAX_RUN_MS,
    FFMPEG_OUTPUT_EXTENSIONS,
} from "../../shared/ffmpeg.ts";

const MEDIA_HOST = "media.pollinations.ai";
const MIME_TYPES = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
};

class ToolFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;
    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
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
                "WWW-Authenticate": 'Bearer realm="ffmpeg.pollinations.ai"',
            },
        },
    );
}

function boundedStream(stream) {
    let bytes = 0;
    return stream.pipeThrough(
        new TransformStream({
            transform(chunk, controller) {
                bytes += chunk.byteLength;
                if (bytes > FFMPEG_MAX_MEDIA_BYTES) {
                    throw new ToolFailure(413, "Source media exceeds 100 MB");
                }
                controller.enqueue(chunk);
            },
        }),
    );
}

async function fetchSource(source, fetchImpl) {
    const response = await fetchImpl(source, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
        throw new ToolFailure(400, "Source redirects are not supported");
    }
    if (!response.ok) {
        throw new ToolFailure(
            response.status >= 500 ? 502 : 400,
            `Source returned HTTP ${response.status}`,
        );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (
        Number.isFinite(contentLength) &&
        contentLength > FFMPEG_MAX_MEDIA_BYTES
    ) {
        throw new ToolFailure(413, "Source media exceeds 100 MB");
    }
    if (!response.body) {
        throw new ToolFailure(400, "Source returned no media");
    }
    return boundedStream(response.body);
}

async function runTool(params, token, env, dependencies) {
    const authorization = await env.BILLING.authorize(token);
    if (!authorization.ok) {
        throw new ToolFailure(authorization.status, authorization.message);
    }

    const input = await fetchSource(params.source, dependencies.fetchImpl);
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const container = dependencies.getContainerImpl(
        env.FFMPEG,
        `ffmpeg-${requestId}`,
    );
    let responseStatus = 200;
    let errorMessage;
    let output;

    try {
        const result = await container.run(
            input,
            params.args,
            params.outputExtension,
            startedAt + FFMPEG_MAX_RUN_MS,
        );
        if (!result.ok) {
            throw new ToolFailure(422, result.stderr || "FFmpeg failed");
        }
        const contentType = MIME_TYPES[params.outputExtension];
        output = await env.MEDIA.upload(result.output, {
            contentType,
            fileName: `ffmpeg.${params.outputExtension}`,
            size: result.bytes,
        });
    } catch (error) {
        responseStatus = error instanceof ToolFailure ? error.status : 502;
        errorMessage = error instanceof Error ? error.message : "FFmpeg failed";
    } finally {
        await container.destroy().catch(() => undefined);
    }

    const settlement = await env.BILLING.settle(token, {
        requestId,
        startedAt,
        runtimeMs: Date.now() - startedAt,
        responseStatus,
        ...(errorMessage && { errorMessage }),
    });
    if (!settlement.ok && !errorMessage) {
        throw new ToolFailure(settlement.status, settlement.message);
    }
    if (errorMessage) {
        throw new ToolFailure(responseStatus, errorMessage);
    }

    return {
        content: [
            {
                type: "resource_link",
                uri: output.url,
                name: "FFmpeg output",
                mimeType: output.contentType,
            },
            {
                type: "text",
                text: JSON.stringify({
                    source: params.source,
                    args: params.args,
                    outputExtension: params.outputExtension,
                    url: output.url,
                    mimeType: output.contentType,
                    charge: settlement.charge,
                }),
            },
        ],
    };
}

function buildServer(token, env, dependencies) {
    const server = new McpServer(
        { name: "pollinations-ffmpeg-mcp", version: "0.1.0" },
        {
            instructions:
                "Run native FFmpeg commands against media.pollinations.ai inputs. Pollinations supplies the input and hosted output; provide only arguments between them.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "runFfmpeg",
        {
            description: `Run native FFmpeg arguments against a media.pollinations.ai URL and return an unlisted hosted resource link. Omit ffmpeg, -i, and the output path. Maximum input/output size is 100 MB and runtime is ${FFMPEG_MAX_RUN_MS / 1000} seconds. Billed at ${FFMPEG_COST_PER_SECOND.toFixed(8)} Pollen per active second.`,
            inputSchema: z.object({
                source: z.url().refine((value) => {
                    const url = new URL(value);
                    return (
                        url.protocol === "https:" &&
                        url.hostname === MEDIA_HOST &&
                        !url.username &&
                        !url.password
                    );
                }, "source must be an HTTPS media.pollinations.ai URL without credentials"),
                args: z
                    .array(z.string().min(1).max(1024))
                    .max(64)
                    .refine(
                        (args) => !args.includes("-i"),
                        "omit -i; Pollinations supplies the input",
                    ),
                outputExtension: z.enum(FFMPEG_OUTPUT_EXTENSIONS),
            }),
        },
        (params) => runTool(params, token, env, dependencies),
    );
    return server;
}

export function createWorker({ fetchImpl, getContainerImpl }) {
    const dependencies = { fetchImpl, getContainerImpl };
    return {
        async fetch(request, env) {
            const url = new URL(request.url);
            if (url.pathname === "/health" && request.method === "GET") {
                return Response.json({
                    name: "pollinations-ffmpeg-mcp",
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
            const handler = createMcpHandler(
                () => buildServer(token, env, dependencies),
                {
                    legacy: "stateless",
                    onerror: (error) => console.error(error),
                },
            );
            return handler.fetch(request, {
                authInfo: {
                    token,
                    clientId: "pollinations-api-key",
                    scopes: [],
                },
            });
        },
    };
}
