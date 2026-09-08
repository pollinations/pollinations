import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";
import {
    calculateFfmpegCharge,
    FFMPEG_COST_PER_SECOND,
    FFMPEG_MAX_MEDIA_BYTES,
    FFMPEG_MAX_RUN_MS,
} from "./ffmpeg.js";

const MAX_SOURCE_REDIRECTS = 5;
const ADJUSTMENT_ID = "cloudflare.container.basic_runtime.v1";
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

function validateSourceUrl(value) {
    const validation = validateUserMediaUrl(value);
    if (!validation.ok || validation.url.protocol !== "https:") {
        throw new ToolFailure(400, "Source must be a public HTTPS URL");
    }
    return validation.url;
}

async function fetchSource(source, fetchImpl, createFixedLengthStream) {
    let url = validateSourceUrl(source);
    let response;
    for (let redirects = 0; ; redirects += 1) {
        response = await fetchImpl(url, { redirect: "manual" });
        if (response.status < 300 || response.status >= 400) break;

        const location = response.headers.get("location");
        if (!location) {
            throw new ToolFailure(400, "Source redirect has no location");
        }
        if (redirects >= MAX_SOURCE_REDIRECTS) {
            throw new ToolFailure(400, "Source has too many redirects");
        }
        await response.body?.cancel();
        url = validateSourceUrl(new URL(location, url).toString());
    }
    if (!response.ok) {
        throw new ToolFailure(
            response.status >= 500 ? 502 : 400,
            `Source returned HTTP ${response.status}`,
        );
    }
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength =
        contentLengthHeader === null ? Number.NaN : Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
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

async function runTool(params, env, dependencies, reportUsage) {
    const inputs = await Promise.all(
        params.sources.map((source) =>
            fetchSource(
                source,
                dependencies.fetchImpl,
                dependencies.createFixedLengthStreamImpl,
            ),
        ),
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
                inputs,
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
        const contentType =
            MIME_TYPES[params.outputExtension.toLowerCase()] ??
            "application/octet-stream";
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
    reportUsage({
        cost: calculateFfmpegCharge(durationMs),
        tool: "runFfmpeg",
        status: responseStatus,
        adjustmentId: ADJUSTMENT_ID,
        adjustmentUnits: durationMs / 1000,
        error: errorMessage,
    });
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
                    sources: params.sources,
                    args: params.args,
                    outputExtension: params.outputExtension,
                    url: output.url,
                    mimeType: output.contentType,
                }),
            },
        ],
    };
}

function buildServer(env, dependencies, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-ffmpeg-mcp", version: "0.1.0" },
        {
            instructions:
                "Run native FFmpeg commands against public HTTPS media. Sources are saved as input0, input1, and so on; pass ordinary FFmpeg arguments and Pollinations hosts the output.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "runFfmpeg",
        {
            description: `Run native FFmpeg arguments against public HTTPS media and return an unlisted hosted resource link. Sources are available as input0, input1, and so on. Include each needed -i argument, but omit ffmpeg and the output path. Maximum size per input/output is 100 MB and runtime is ${FFMPEG_MAX_RUN_MS / 1000} seconds. Billed at ${FFMPEG_COST_PER_SECOND.toFixed(8)} Pollen per active second.`,
            inputSchema: z.object({
                sources: z
                    .array(
                        z.url().refine((value) => {
                            const validation = validateUserMediaUrl(value);
                            return (
                                validation.ok &&
                                validation.url.protocol === "https:"
                            );
                        }, "sources must be public HTTPS URLs without credentials"),
                    )
                    .min(1)
                    .describe(
                        "Ordered source URLs, saved as input0, input1, and so on.",
                    ),
                args: z.array(z.string().min(1).max(1024)).max(64),
                outputExtension: z
                    .string()
                    .regex(
                        /^[a-zA-Z0-9]{1,16}$/,
                        "outputExtension must contain only letters and numbers",
                    )
                    .describe(
                        "Output filename extension without a dot. Any single-file format supported by FFmpeg is accepted.",
                    ),
            }),
        },
        (params) => runTool(params, env, dependencies, reportUsage),
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
            if (url.pathname !== "/") {
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

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer(env, dependencies, (reportedUsage) => {
                        usage = reportedUsage;
                    }),
                {
                    onerror: (error) => console.error(error),
                },
            );
            const response = await handler.fetch(request);
            // The stateless handler may finish a tool while its small JSON
            // response body is being read. Materialize it before attaching the
            // usage reported by that tool.
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
