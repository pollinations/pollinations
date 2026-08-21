import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    calculateFfmpegCharge,
    FFMPEG_COST_PER_SECOND,
    FFMPEG_MAX_MEDIA_BYTES,
    FFMPEG_MAX_RUN_MS,
    FFMPEG_MODEL,
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

async function fetchSource(source, fetchImpl, createFixedLengthStream) {
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
    if (!Number.isFinite(contentLength) || contentLength < 0) {
        throw new ToolFailure(502, "Source media size is unavailable");
    }
    if (contentLength > FFMPEG_MAX_MEDIA_BYTES) {
        throw new ToolFailure(413, "Source media exceeds 100 MB");
    }
    if (!response.body) {
        throw new ToolFailure(400, "Source returned no media");
    }
    const input = createFixedLengthStream(contentLength);
    response.body.pipeTo(input.writable).catch(() => undefined);
    return input.readable;
}

async function runTool(params, token, env, dependencies) {
    const authorization = await env.BILLING.authorize(token);
    if (!authorization.ok) {
        throw new ToolFailure(authorization.status, authorization.message);
    }

    const input = await fetchSource(
        params.source,
        dependencies.fetchImpl,
        dependencies.createFixedLengthStreamImpl,
    );
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
        let result;
        try {
            result = await container.run(
                input,
                params.args,
                params.outputExtension,
                startedAt + FFMPEG_MAX_RUN_MS,
            );
        } catch (error) {
            throw new ToolFailure(
                502,
                `FFmpeg container failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
        if (!result.ok) {
            throw new ToolFailure(422, result.stderr || "FFmpeg failed");
        }
        const contentType = MIME_TYPES[params.outputExtension];
        const mediaBody = dependencies.createFixedLengthStreamImpl(
            result.bytes,
        );
        result.output.pipeTo(mediaBody.writable).catch(() => undefined);
        try {
            output = await env.MEDIA.upload(mediaBody.readable, {
                contentType,
                fileName: `ffmpeg.${params.outputExtension}`,
                size: result.bytes,
            });
        } catch (error) {
            throw new ToolFailure(
                502,
                `Media upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    } catch (error) {
        responseStatus = error instanceof ToolFailure ? error.status : 502;
        errorMessage = error instanceof Error ? error.message : "FFmpeg failed";
    } finally {
        await container.destroy().catch(() => undefined);
    }

    const durationMs = Date.now() - startedAt;
    const settlement = await env.BILLING.charge(token, {
        requestId,
        mcpId: FFMPEG_MODEL,
        toolName: "runFfmpeg",
        provider: "cloudflare",
        eventType: "tool.media",
        startedAt,
        durationMs,
        responseStatus,
        amount: calculateFfmpegCharge(durationMs),
        adjustment: {
            id: "cloudflare.container.basic_runtime.v1",
            units: durationMs / 1000,
        },
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

export function createWorker({
    fetchImpl,
    getContainerImpl,
    createFixedLengthStreamImpl,
}) {
    const dependencies = {
        fetchImpl,
        getContainerImpl,
        createFixedLengthStreamImpl,
    };
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
