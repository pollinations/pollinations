import { getContainer } from "@cloudflare/containers";
import { ensureUpstreamOk } from "@shared/error.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { FfmpegContainer } from "@/durable-objects/FfmpegContainer.ts";
import type { Env } from "@/env.ts";
import type { FfmpegRequest } from "@/schemas/ffmpeg.ts";
import { checkBalance } from "@/utils/generation-access.ts";

export const FFMPEG_MODEL = "ffmpeg";
export const BASIC_CONTAINER_COST_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;
const MAX_RUN_SECONDS = 110;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const FFMPEG_RUNTIME_HEADER = "x-ffmpeg-runtime-ms";

function runtimeSeconds(output: unknown): number {
    if (
        !output ||
        typeof output !== "object" ||
        !("ffmpegRuntimeMs" in output)
    ) {
        return 0;
    }
    const milliseconds = Number(output.ffmpegRuntimeMs);
    return Number.isFinite(milliseconds) && milliseconds > 0
        ? milliseconds / 1000
        : 0;
}

const FFMPEG_DEFINITION: ModelDefinition = {
    aliases: [],
    provider: "cloudflare",
    brand: "Cloudflare",
    category: "video",
    cost: {},
    priceMultiplier: 1,
    billing: {
        adjustments: [
            {
                id: "cloudflare.container.basic_runtime.v1",
                description:
                    "Native FFmpeg runs in a basic Cloudflare Container billed at published resource rates.",
                kind: "compute_runtime",
                unit: "second",
                unitCost: BASIC_CONTAINER_COST_PER_SECOND,
                publicPricing: {
                    label: "Container runtime",
                    quantity: 1,
                    unit: "second",
                },
                countUnits: runtimeSeconds,
            },
        ],
    },
    addedDate: Date.UTC(2026, 7, 17),
    title: "FFmpeg",
    description: "Run FFmpeg arguments against Pollinations media",
    inputModalities: ["video", "audio", "image"],
    outputModalities: ["video", "audio", "image"],
    supportedEndpoints: ["/v1/media/ffmpeg"],
};

export const resolveFfmpeg = createMiddleware<Env>(async (c, next) => {
    c.set("model", {
        requested: FFMPEG_MODEL,
        resolved: FFMPEG_MODEL,
        definition: FFMPEG_DEFINITION,
    });
    await next();
});

export const ffmpegAccess = createMiddleware<Env>(async (c, next) => {
    c.var.auth.requireUser();
    await checkBalance(
        c.var,
        c.env,
        MAX_RUN_SECONDS * BASIC_CONTAINER_COST_PER_SECOND,
    );
    await next();
});

function runtimeBillingHeaders(startedAt: number): Record<string, string> {
    const runtimeMs = Math.min(
        MAX_RUN_SECONDS * 1000,
        Math.max(1, Date.now() - startedAt),
    );
    return {
        [FFMPEG_RUNTIME_HEADER]: String(runtimeMs),
        ...buildUsageHeaders(FFMPEG_MODEL, {}),
    };
}

function setRuntimeBillingHeaders(c: Context<Env>, startedAt: number): void {
    for (const [name, value] of Object.entries(
        runtimeBillingHeaders(startedAt),
    )) {
        c.header(name, value);
    }
}

function contentTypeForExtension(extension: string): string {
    return (
        {
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
        }[extension] || "application/octet-stream"
    );
}

export async function runFfmpeg(c: Context<Env>) {
    const input = c.req.valid("json" as never) as FfmpegRequest;
    if (!c.env.FFMPEG) {
        throw new HTTPException(503, { message: "FFmpeg is unavailable" });
    }
    const startedAt = Date.now();
    const deadlineMs = startedAt + MAX_RUN_SECONDS * 1000;

    const sourceResponse = await fetch(input.source, { redirect: "manual" });
    if (sourceResponse.status >= 300 && sourceResponse.status < 400) {
        throw new HTTPException(400, {
            message: "source redirects are not supported",
        });
    }
    await ensureUpstreamOk(sourceResponse, input.source);
    const contentLength = Number(sourceResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
        throw new HTTPException(413, {
            message: "source media must be smaller than 100 MB",
        });
    }
    if (!sourceResponse.body) {
        throw new HTTPException(400, { message: "source returned no media" });
    }

    const container = getContainer<FfmpegContainer>(
        c.env.FFMPEG,
        `ffmpeg-${crypto.randomUUID()}`,
    );
    let result: Awaited<ReturnType<FfmpegContainer["run"]>>;
    try {
        result = await container.run(
            sourceResponse.body,
            input.args,
            input.outputExtension,
            deadlineMs,
        );
    } catch (error) {
        await container.destroy().catch(() => undefined);
        setRuntimeBillingHeaders(c, startedAt);
        throw new HTTPException(502, {
            message: error instanceof Error ? error.message : "FFmpeg failed",
        });
    }
    if (!result.ok) {
        await container.destroy().catch(() => undefined);
        setRuntimeBillingHeaders(c, startedAt);
        throw new HTTPException(422, {
            message: result.stderr || "FFmpeg failed",
        });
    }

    const headers = new Headers({
        "content-type": contentTypeForExtension(input.outputExtension),
        "content-length": String(result.bytes),
        ...runtimeBillingHeaders(startedAt),
    });
    const { readable, writable } = new TransformStream<Uint8Array>();
    c.executionCtx.waitUntil(
        result.output
            .pipeTo(writable)
            .catch(() => undefined)
            .finally(() => container.destroy().catch(() => undefined)),
    );
    return new Response(readable, { headers });
}

export function ffmpegBillingOutput(response: Response): unknown | undefined {
    const runtimeMs = Number(response.headers.get(FFMPEG_RUNTIME_HEADER));
    return Number.isFinite(runtimeMs) && runtimeMs > 0
        ? { ffmpegRuntimeMs: runtimeMs }
        : undefined;
}
