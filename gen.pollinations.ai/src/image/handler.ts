import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { UpstreamError } from "@/error.ts";
import {
    countFluxJobs,
    getRegisteredServers,
    registerServer,
    type ServerType,
    setServerRegistryBinding,
} from "./availableServers.ts";
import {
    type AuthResult,
    createAndReturnImageCached,
    type ImageGenerationResult,
} from "./createAndReturnImages.ts";
import {
    createAndReturnVideo,
    isVideoModel,
    type VideoGenerationResult,
} from "./createAndReturnVideos.ts";
import { syncImageEnv } from "./env.ts";
import { HttpError } from "./httpError.ts";
import {
    type MinimalRequest,
    normalizeAndTranslatePrompt,
    type TimingStep,
} from "./normalizeAndTranslatePrompt.ts";
import { type ImageParams, ImageParamsSchema } from "./params.ts";
import { createProgressTracker } from "./progressBar.ts";
import { sleep } from "./util.ts";
import { bufferToUint8Array, detectMimeType } from "./utils/imageDownload.ts";
import { setImagesBinding } from "./utils/imageTransform.ts";
import { buildTrackingHeaders } from "./utils/trackingHeaders.ts";

type ImageContext = Context<Env>;

const IMAGE_ENV_KEYS = [
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_CONTENT_SAFETY_API_KEY",
    "AZURE_CONTENT_SAFETY_ENDPOINT",
    "AZURE_MYCELI_PROD_EASTUS2_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "BYTEDANCE_API_KEY",
    "DASHSCOPE_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "KLEIN_URL",
    "LTX2_BASE_URL",
    "NOVA_REEL_S3_BUCKET",
    "OPENAI_API_KEY",
    "PLN_GPU_TOKEN",
    "PRUNA_API_KEY",
    "XAI_API_KEY",
] as const satisfies readonly (keyof CloudflareBindings)[];

export function syncImageEnvironment(env: CloudflareBindings): void {
    syncImageEnv(env, IMAGE_ENV_KEYS);
    setServerRegistryBinding(env.KV, env.ENVIRONMENT);
    setImagesBinding(env.IMAGES);
}

function createAuthResult(c: ImageContext): AuthResult {
    return {
        authenticated: true,
        tokenAuth: Boolean(c.var.auth?.apiKey),
        referrerAuth: false,
        bypass: false,
        reason: "GEN_GATEWAY",
        userId: c.var.auth?.user?.id || null,
        username: c.var.auth?.user?.githubUsername || null,
        debugInfo: {},
    };
}

function createMinimalRequest(c: ImageContext): MinimalRequest {
    return {
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        url: c.req.url,
    };
}

async function readJsonBody(c: ImageContext): Promise<Record<string, unknown>> {
    if (c.req.method !== "POST") return {};
    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("application/json")) return {};
    try {
        return (await c.req.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function decodePrompt(rawPrompt: string): string {
    try {
        return decodeURIComponent(rawPrompt);
    } catch {
        return rawPrompt;
    }
}

function parseImageParams(
    c: ImageContext,
    body: Record<string, unknown>,
): ImageParams {
    const queryParams = Object.fromEntries(new URL(c.req.url).searchParams);
    const mergedParams = {
        ...queryParams,
        ...body,
        model: c.var.model.resolved,
    };
    delete (mergedParams as Record<string, unknown>).prompt;
    delete (mergedParams as Record<string, unknown>).key;

    const parseResult = ImageParamsSchema.safeParse(mergedParams);
    if (!parseResult.success) {
        throw new UpstreamError(400, {
            message: `Invalid parameters: ${parseResult.error.issues[0]?.message || "validation failed"}`,
            cause: parseResult.error.issues,
        });
    }
    return parseResult.data;
}

function contentDisposition(prompt: string, extension: string): string {
    const baseFilename = prompt
        .slice(0, 100)
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    return `inline; filename="${baseFilename || "generated-media"}.${extension}"`;
}

function mediaHeaders(
    prompt: string,
    safeParams: ImageParams,
    result: ImageGenerationResult | VideoGenerationResult,
    contentType: string,
): Headers {
    const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
    });
    const extension = contentType.includes("video")
        ? "mp4"
        : contentType.split("/")[1] || "jpg";
    headers.set("Content-Disposition", contentDisposition(prompt, extension));

    const trackingHeaders = buildTrackingHeaders(
        safeParams.model,
        result.trackingData,
    );
    for (const [key, value] of Object.entries(trackingHeaders)) {
        headers.set(key, value);
    }

    return headers;
}

function throwImageError(error: unknown, c: ImageContext): never {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof HttpError) {
        throw new UpstreamError(error.status as ContentfulStatusCode, {
            message: error.message,
            requestUrl: new URL(c.req.url),
            upstreamStatus: error.status,
            responseBody: JSON.stringify(error.details || {}),
            cause: error,
        });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new UpstreamError(500, {
        message: message || "Image generation failed",
        requestUrl: new URL(c.req.url),
        cause: error,
    });
}

function assertNonEmptyMedia(buffer: Buffer, label: string): void {
    if (buffer.length === 0) {
        throw new HttpError(`${label} returned an empty response`, 502);
    }
}

async function generateImageResult(
    c: ImageContext,
    originalPrompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    const timingInfo: TimingStep[] = [
        { step: "Request received.", timestamp: Date.now() },
    ];
    const requestId = c.get("requestId");
    const progress = createProgressTracker().startRequest(requestId);

    progress.updateBar(requestId, 20, "Prompt", "Normalizing...");
    const { prompt } = await normalizeAndTranslatePrompt(
        originalPrompt,
        createMinimalRequest(c),
        timingInfo,
        safeParams,
    );
    progress.updateBar(requestId, 30, "Prompt", "Normalized");
    progress.setProcessing(requestId);

    const result = await createAndReturnImageCached(
        prompt,
        safeParams,
        await countFluxJobs(),
        originalPrompt,
        progress,
        requestId,
        createAuthResult(c),
    );

    if (result.isChild && result.isMature) {
        progress.updateBar(requestId, 85, "Safety", "Additional review...");
        await sleep(5000);
    }

    progress.completeBar(requestId, "Image generation complete");
    progress.stop();
    return result;
}

async function generateVideoResult(
    c: ImageContext,
    originalPrompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const requestId = c.get("requestId");
    const progress = createProgressTracker().startRequest(requestId);
    progress.setProcessing(requestId);
    const result = await createAndReturnVideo(
        originalPrompt,
        safeParams,
        progress,
        requestId,
    );
    progress.completeBar(requestId, "Video generation complete");
    progress.stop();
    return result;
}

export async function generateImageOrVideoResponse(
    c: ImageContext,
    prompt: string,
    body: Record<string, unknown> = {},
): Promise<Response> {
    syncImageEnvironment(c.env);
    const originalPrompt = decodePrompt(prompt || "random_prompt");
    const safeParams = parseImageParams(c, body);

    try {
        if (isVideoModel(safeParams.model)) {
            const result = await generateVideoResult(
                c,
                originalPrompt,
                safeParams,
            );
            assertNonEmptyMedia(result.buffer, "Video provider");
            return new Response(bufferToUint8Array(result.buffer), {
                headers: mediaHeaders(
                    originalPrompt,
                    safeParams,
                    result,
                    result.mimeType || "video/mp4",
                ),
            });
        }

        const result = await generateImageResult(c, originalPrompt, safeParams);
        assertNonEmptyMedia(result.buffer, "Image provider");
        return new Response(bufferToUint8Array(result.buffer), {
            headers: mediaHeaders(
                originalPrompt,
                safeParams,
                result,
                detectMimeType(result.buffer),
            ),
        });
    } catch (error) {
        throwImageError(error, c);
    }
}

export async function handleImagePrompt(c: ImageContext): Promise<Response> {
    return generateImageOrVideoResponse(
        c,
        c.req.param("prompt"),
        await readJsonBody(c),
    );
}

export async function handleRegisterServer(c: ImageContext): Promise<Response> {
    syncImageEnvironment(c.env);

    if (c.req.method === "GET") {
        const params = new URL(c.req.url).searchParams;
        const directUrl = params.get("url");
        const ip = params.get("ip");
        const port = params.get("port");
        const type = (params.get("type") || "flux") as ServerType;
        const scheme = port === "443" ? "https" : "http";
        const url =
            directUrl ||
            (ip ? `${scheme}://${ip}${port ? `:${port}` : ""}` : "");

        if (!url) return handleListRegisteredServers(c);

        await registerServer(url, type);
        return c.json({
            success: true,
            message: "Server registered successfully",
        });
    }

    let body: { url?: string; type?: ServerType };
    try {
        body = (await c.req.json()) as { url?: string; type?: ServerType };
    } catch {
        return c.json({ success: false, message: "Invalid JSON" }, 400);
    }
    if (!body.url) {
        return c.json(
            {
                success: false,
                message: "Invalid request body - url is required",
            },
            400,
        );
    }

    await registerServer(body.url, body.type || "flux");
    return c.json({
        success: true,
        message: "Server registered successfully",
    });
}

export async function handleListRegisteredServers(
    c: ImageContext,
): Promise<Response> {
    syncImageEnvironment(c.env);
    const types: ServerType[] = ["flux", "translate", "zimage"];
    const entries = await Promise.all(
        types.map(async (type) =>
            (await getRegisteredServers(type)).map((server) => ({
                type,
                ...server,
            })),
        ),
    );
    return c.json(entries.flat());
}
