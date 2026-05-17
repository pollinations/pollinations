import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { remapUpstreamStatus, UpstreamError } from "@/error.ts";
import {
    countFluxJobs,
    getRegisteredServers,
    isValidType,
    registerServer,
    type ServerType,
    setServerRegistryBinding,
    VALID_TYPES,
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
import { getImageEnv, syncImageEnv } from "./env.ts";
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
    "REPLICATE_API_TOKEN",
    "XAI_API_KEY",
] as const satisfies readonly (keyof CloudflareBindings)[];

export function syncImageEnvironment(env: CloudflareBindings): void {
    syncImageEnv(env, IMAGE_ENV_KEYS);
    setServerRegistryBinding(env.KV, env.ENVIRONMENT);
    // The Workers test Images binding can return empty bodies; route tests cover provider flow, not CF transforms.
    setImagesBinding(env.ENVIRONMENT === "test" ? undefined : env.IMAGES);
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
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
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

function safeUpstreamUrl(value: string | undefined): URL | undefined {
    if (!value) return undefined;
    try {
        return new URL(value);
    } catch {
        return undefined;
    }
}

function throwImageError(error: unknown, c: ImageContext): never {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof HttpError) {
        const { status, message } = classifyImageHttpError(error);
        throw new UpstreamError(status, {
            message,
            requestUrl:
                safeUpstreamUrl(error.upstreamUrl) ?? new URL(c.req.url),
            upstreamStatus: error.status,
            responseBody: imageResponseBody(error),
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

type ParsedUpstreamBody = {
    kind: "validation" | "message" | "none";
    text: string | null;
};

/**
 * Build the responseBody to thread through UpstreamError so clients see a real
 * error message instead of `"{}"`. Prefer the upstream provider's raw body
 * (already in details.body), then the HttpError message, then a JSON-encoded
 * details bag as last resort.
 */
function imageResponseBody(error: HttpError): string {
    const detailsBody = error.details?.body;
    if (typeof detailsBody === "string" && detailsBody.length > 0) {
        return detailsBody;
    }
    if (error.message) {
        return JSON.stringify({ message: error.message });
    }
    return JSON.stringify(error.details || {});
}

function classifyImageHttpError(error: HttpError): {
    status: ContentfulStatusCode;
    message: string;
} {
    const parsed = parseUpstreamErrorBody(error);
    const isValidation =
        error.status === 422 ||
        (error.status === 400 &&
            (error.details?.validation === true ||
                parsed.kind === "validation"));

    if (isValidation) {
        const text = parsed.text || error.message;
        return {
            status: 400,
            message: text
                ? `Invalid image request: ${text}`
                : "Invalid image request",
        };
    }

    if (error.status === 413) {
        return {
            status: remapUpstreamStatus(error.status),
            message: "Image request payload is too large",
        };
    }

    if (error.status >= 400 && error.status < 500) {
        const text = parsed.text || error.message;
        return {
            status: remapUpstreamStatus(error.status),
            message: text
                ? `Image provider error: ${text}`
                : "Image provider error",
        };
    }

    return {
        status: remapUpstreamStatus(error.status),
        message: error.message,
    };
}

function parseUpstreamErrorBody(error: HttpError): ParsedUpstreamBody {
    const body =
        typeof error.details?.body === "string" ? error.details.body : "";
    if (!body) return { kind: "none", text: null };

    let parsed: {
        detail?:
            | string
            | Array<{
                  loc?: unknown[];
                  msg?: string;
                  ctx?: Record<string, unknown>;
              }>;
        message?: string;
        error?: string | { message?: string };
    };
    try {
        parsed = JSON.parse(body);
    } catch {
        return { kind: "none", text: null };
    }

    if (Array.isArray(parsed.detail) && parsed.detail.length > 0) {
        const text = parsed.detail
            .map(formatImageValidationDetail)
            .filter((m): m is string => Boolean(m))
            .join("; ");
        return { kind: "validation", text: text || null };
    }
    if (typeof parsed.detail === "string") {
        return { kind: "validation", text: parsed.detail };
    }
    if (typeof parsed.message === "string") {
        return { kind: "message", text: parsed.message };
    }
    if (typeof parsed.error === "string") {
        return { kind: "message", text: parsed.error };
    }
    if (typeof parsed.error?.message === "string") {
        return { kind: "message", text: parsed.error.message };
    }
    return { kind: "none", text: null };
}

function formatImageValidationDetail(detail: {
    loc?: unknown[];
    msg?: string;
    ctx?: Record<string, unknown>;
}): string | null {
    const field = detail.loc
        ?.filter((part) => part !== "body")
        .map(String)
        .join(".");
    if (!detail.msg) return field || null;
    const ctx = detail.ctx || {};
    if (field && ctx.ge !== undefined) {
        return `${field} must be at least ${ctx.ge}`;
    }
    if (field && ctx.le !== undefined) {
        return `${field} must be at most ${ctx.le}`;
    }
    return field ? `${field}: ${detail.msg}` : detail.msg;
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

export async function handleImagePrompt(
    c: ImageContext,
    prompt: string,
): Promise<Response> {
    return generateImageOrVideoResponse(c, prompt, await readJsonBody(c));
}

function extractRegisterToken(
    c: ImageContext,
    body: Record<string, unknown>,
): string | null {
    const header = c.req.header("x-backend-token");
    if (header) return header;
    const authz = c.req.header("authorization");
    if (authz) {
        const match = authz.match(/^Bearer\s+(.+)$/i);
        if (match) return match[1];
    }
    const query = new URL(c.req.url).searchParams.get("token");
    if (query) return query;
    if (typeof body.token === "string") return body.token;
    return null;
}

function isAuthorizedRegisterWrite(
    c: ImageContext,
    body: Record<string, unknown>,
): boolean {
    const expected = getImageEnv("PLN_GPU_TOKEN");
    if (!expected) return false;
    return extractRegisterToken(c, body) === expected;
}

export async function handleRegisterServer(c: ImageContext): Promise<Response> {
    syncImageEnvironment(c.env);

    if (c.req.method === "GET") {
        const params = new URL(c.req.url).searchParams;
        const directUrl = params.get("url");
        const ip = params.get("ip");
        const port = params.get("port");
        const typeParam = params.get("type") || "flux";
        const scheme = port === "443" ? "https" : "http";
        const url =
            directUrl ||
            (ip ? `${scheme}://${ip}${port ? `:${port}` : ""}` : "");

        if (!url) return handleListRegisteredServers(c);

        if (!isAuthorizedRegisterWrite(c, {})) {
            return c.json({ success: false, message: "Unauthorized" }, 401);
        }
        if (!isValidType(typeParam)) {
            return c.json(
                { success: false, message: `Invalid type "${typeParam}"` },
                400,
            );
        }

        await registerServer(url, typeParam);
        return c.json({
            success: true,
            message: "Server registered successfully",
        });
    }

    let body: Record<string, unknown>;
    try {
        body = (await c.req.json()) as Record<string, unknown>;
    } catch {
        return c.json({ success: false, message: "Invalid JSON" }, 400);
    }

    if (!isAuthorizedRegisterWrite(c, body)) {
        return c.json({ success: false, message: "Unauthorized" }, 401);
    }

    const url = typeof body.url === "string" ? body.url : "";
    if (!url) {
        return c.json(
            {
                success: false,
                message: "Invalid request body - url is required",
            },
            400,
        );
    }

    const typeParam = typeof body.type === "string" ? body.type : "flux";
    if (!isValidType(typeParam)) {
        return c.json(
            { success: false, message: `Invalid type "${typeParam}"` },
            400,
        );
    }

    await registerServer(url, typeParam);
    return c.json({
        success: true,
        message: "Server registered successfully",
    });
}

export async function handleListRegisteredServers(
    c: ImageContext,
): Promise<Response> {
    syncImageEnvironment(c.env);
    const entries = await Promise.all(
        VALID_TYPES.map(async (type: ServerType) =>
            (await getRegisteredServers(type)).map((server) => ({
                type,
                ...server,
            })),
        ),
    );
    return c.json(entries.flat());
}
