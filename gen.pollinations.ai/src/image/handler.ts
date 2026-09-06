import { UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import {
    type FallbackCandidate,
    fallbackCandidates,
    formatFallbackTarget,
    isRetryableFallbackError,
    withModelFallback,
} from "../fallback.ts";
import { enforceModelRateLimit } from "../utils/model-rate-limit.ts";
import {
    getRegisteredServers,
    isValidType,
    registerServer,
    type ServerType,
    setServerRegistryBinding,
    VALID_TYPES,
} from "./availableServers.ts";
import {
    callCommunityImageEndpoint,
    callCommunityVideoEndpoint,
} from "./communityEndpoint.ts";
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
import { setKleinVpcBinding } from "./models/fluxKleinModel.ts";
import { clampNovaCanvasDimensions } from "./models/novaCanvasModel.ts";
import {
    CommunityReferenceParamsSchema,
    type ImageParams,
    ImageParamsSchema,
} from "./params.ts";
import { sanitizeString, sleep } from "./util.ts";
import {
    CONTENT_POLICY_ERROR_CODE,
    CONTENT_POLICY_STATUS,
    firstContentPolicyMessage,
    providerErrorText,
} from "./utils/contentModeration.ts";
import {
    bufferToUint8Array,
    detectMimeType,
    downloadUserImage,
    readImageDimensions,
} from "./utils/imageDownload.ts";
import { setImagesBinding } from "./utils/imageTransform.ts";
import { buildTrackingHeaders } from "./utils/trackingHeaders.ts";

type ImageContext = Context<Env>;
type RuntimeImageParams = Omit<ImageParams, "model"> & { model: string };

const EDIT_IMAGE_PROBE_TIMEOUT_MS = 10_000;
const EDIT_DIMENSION_STEP = 16;
const MIN_EDIT_DIMENSION = 256;

const IMAGE_ENV_KEYS = [
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_CONTENT_SAFETY_API_KEY",
    "AZURE_CONTENT_SAFETY_ENDPOINT",
    "AZURE_MYCELI_PROD_IMG_15_SWEDEN_API_KEY",
    "AZURE_MYCELI_PROD_IMG_15_WESTUS3_API_KEY",
    "AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY",
    "AZURE_MYCELI_PROD_IMG_2_SWEDEN_API_KEY",
    "AZURE_MYCELI_PROD_IMG_MINI_SWEDEN_API_KEY",
    "AZURE_MYCELI_PROD_IMG_MINI_WESTUS3_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "DEEPINFRA_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "FAL_KEY",
    "KLEIN_URL",
    "NOVA_REEL_S3_BUCKET",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "PLN_GPU_TOKEN",
    "REPLICATE_API_TOKEN",
    "XAI_API_KEY",
] as const satisfies readonly (keyof CloudflareBindings)[];

export function syncImageEnvironment(env: CloudflareBindings): void {
    syncImageEnv(env, IMAGE_ENV_KEYS);
    setKleinVpcBinding(env.KLEIN_VPC);
    setServerRegistryBinding(env.KV, env.ENVIRONMENT);
    // The Workers test Images binding can return empty bodies; route tests cover provider flow, not CF transforms.
    setImagesBinding(env.ENVIRONMENT === "test" ? undefined : env.IMAGES);
}

function createAuthResult(c: ImageContext): AuthResult {
    return {
        tokenAuth: Boolean(c.var.auth?.apiKey),
        userId: c.var.auth?.user?.id || null,
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
): RuntimeImageParams {
    const queryParams = Object.fromEntries(new URL(c.req.url).searchParams);
    const resolvedModel = c.var.model.resolved;
    const mergedParams: Record<string, unknown> = {
        ...queryParams,
        ...body,
        model: c.var.model.communityEndpoint
            ? DEFAULT_IMAGE_MODEL
            : resolvedModel,
    };
    delete mergedParams.prompt;
    delete mergedParams.key;

    const communityReferences =
        c.var.model.communityEndpoint?.modality === "video"
            ? CommunityReferenceParamsSchema.safeParse(mergedParams)
            : null;
    if (communityReferences && !communityReferences.success) {
        throw new UpstreamError(400, {
            message: `Invalid parameters: ${communityReferences.error.issues[0]?.message || "validation failed"}`,
            cause: communityReferences.error.issues,
        });
    }
    if (communityReferences) {
        delete mergedParams.reference_images;
        delete mergedParams.reference_videos;
        delete mergedParams.reference_audios;
    }
    const parseResult = ImageParamsSchema.safeParse(mergedParams);
    if (!parseResult.success) {
        throw new UpstreamError(400, {
            message: `Invalid parameters: ${parseResult.error.issues[0]?.message || "validation failed"}`,
            cause: parseResult.error.issues,
        });
    }
    return {
        ...parseResult.data,
        ...(communityReferences?.data ?? {}),
        model: resolvedModel,
    };
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
    safeParams: RuntimeImageParams,
    result: ImageGenerationResult | VideoGenerationResult,
    contentType: string,
): Headers {
    const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    });
    const extension = contentType.includes("video")
        ? "mp4"
        : contentType === "image/svg+xml"
          ? "svg"
          : contentType.split("/")[1] || "jpg";
    headers.set("Content-Disposition", contentDisposition(prompt, extension));
    if (contentType === "image/svg+xml") {
        headers.set(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
        headers.set("X-Content-Type-Options", "nosniff");
    }

    const trackingHeaders = buildTrackingHeaders(
        safeParams.model,
        result.trackingData,
    );
    for (const [key, value] of Object.entries(trackingHeaders)) {
        headers.set(key, value);
    }

    return headers;
}

export function throwImageError(error: unknown): never {
    const upstream =
        error instanceof UpstreamError
            ? error
            : new UpstreamError(500, {
                  message:
                      (error instanceof Error
                          ? error.message
                          : String(error)) || "Image generation failed",
                  cause: error,
              });
    // Explicit codes (including user-image failures) already define the public contract.
    if (upstream.errorCode) throw upstream;
    const moderation = firstContentPolicyMessage([
        providerErrorText(upstream.responseBody),
        providerErrorText(upstream.message),
    ]);
    const status = moderation
        ? CONTENT_POLICY_STATUS
        : upstream.status === 422
          ? 400
          : upstream.status;
    if (status === upstream.status && !moderation) throw upstream;
    throw new UpstreamError(status, {
        ...upstream,
        message: upstream.message,
        errorCode: moderation ? CONTENT_POLICY_ERROR_CODE : upstream.errorCode,
        cause: upstream,
    });
}

function assertNonEmptyMedia(buffer: Buffer, label: string): void {
    if (buffer.length === 0) {
        throw UpstreamError.fromProvider(502, {
            message: `${label} returned an empty response`,
        });
    }
}

async function generateImageResult(
    c: ImageContext,
    originalPrompt: string,
    safeParams: RuntimeImageParams,
): Promise<ImageGenerationResult> {
    const prompt = sanitizeString(String(originalPrompt));

    const result = await createAndReturnImageCached(
        prompt,
        safeParams as ImageParams,
        originalPrompt,
        createAuthResult(c),
    );

    if (result.isChild && result.isMature) {
        await sleep(5000);
    }

    return result;
}

/** Tries the requested model and its fallbacks through one modality-neutral loop. */
async function generateMediaWithFallback(
    c: ImageContext,
    prompt: string,
    safeParams: RuntimeImageParams,
): Promise<{
    result: ImageGenerationResult | VideoGenerationResult;
    params: RuntimeImageParams;
    servedIndex: number;
}> {
    const shouldFallback = (error: unknown, candidate: FallbackCandidate) => {
        if (
            candidate.definition?.provider === "azure" &&
            candidate.definition.brand === "OpenAI"
        ) {
            return (
                error instanceof UpstreamError && error.upstreamStatus === 429
            );
        }
        return isRetryableFallbackError(error);
    };
    const { result, index } = await withModelFallback(
        fallbackCandidates(c.var.model),
        async (attempt) => {
            const params = { ...safeParams, model: attempt.id };
            if (attempt.communityEndpoint) {
                const isVideo = attempt.communityEndpoint.modality === "video";
                const generated = isVideo
                    ? await callCommunityVideoEndpoint(
                          attempt.communityEndpoint,
                          prompt,
                          params,
                          c.env.BETTER_AUTH_SECRET,
                      )
                    : await callCommunityImageEndpoint(
                          attempt.communityEndpoint,
                          prompt,
                          params,
                          c.env.BETTER_AUTH_SECRET,
                      );
                assertNonEmptyMedia(
                    generated.buffer,
                    isVideo
                        ? "Community video endpoint"
                        : "Community image endpoint",
                );
                return { result: generated, params };
            }
            if (isVideoModel(params.model)) {
                const generated = await generateVideoResult(c, prompt, params);
                assertNonEmptyMedia(generated.buffer, "Video provider");
                return { result: generated, params };
            }
            const generated = await generateImageResult(c, prompt, params);
            assertNonEmptyMedia(generated.buffer, "Image provider");
            return { result: generated, params };
        },
        c.var.track?.attempts,
        (attempt) => enforceModelRateLimit(c, attempt),
        shouldFallback,
    );
    return {
        ...result,
        servedIndex: index,
    };
}

async function generateVideoResult(
    c: ImageContext,
    originalPrompt: string,
    safeParams: RuntimeImageParams,
): Promise<VideoGenerationResult> {
    return createAndReturnVideo(
        originalPrompt,
        safeParams as ImageParams,
        c.get("requestId"),
    );
}

/**
 * Edit requests that omit `size` should preserve the source image's aspect
 * ratio instead of silently defaulting to the model's square default (e.g.
 * 1024x1024). Downloads the first reference image, reads its actual
 * dimensions, and overrides the params. Explicit size requests and video
 * models are untouched; any failure falls back to the model default.
 */
export async function resolveEditDimensionsForImage(
    safeParams: RuntimeImageParams,
): Promise<RuntimeImageParams> {
    if (safeParams.dimensionsExplicit) return safeParams;
    const imageUrls = safeParams.image;
    if (!imageUrls?.length) return safeParams;
    try {
        const { buffer, mimeType } = await downloadUserImage(
            imageUrls[0],
            AbortSignal.timeout(EDIT_IMAGE_PROBE_TIMEOUT_MS),
        );
        const source = readImageDimensions(buffer, mimeType);
        if (!source) return safeParams;

        const targetLongEdge = Math.max(safeParams.width, safeParams.height);
        const scale = targetLongEdge / Math.max(source.width, source.height);
        const normalizeSide = (side: number) =>
            Math.max(
                MIN_EDIT_DIMENSION,
                Math.round((side * scale) / EDIT_DIMENSION_STEP) *
                    EDIT_DIMENSION_STEP,
            );
        return {
            ...safeParams,
            width: normalizeSide(source.width),
            height: normalizeSide(source.height),
        };
    } catch {
        // Keep the model default if the source image cannot be read.
        return safeParams;
    }
}
export async function generateImageOrVideoResponse(
    c: ImageContext,
    prompt: string,
    body: Record<string, unknown> = {},
): Promise<Response> {
    syncImageEnvironment(c.env);
    const originalPrompt = decodePrompt(prompt || "random_prompt");
    const parsedParams = parseImageParams(c, body);
    const definition = c.var.model.definition;
    const safeParams =
        definition.category === "image" &&
        definition.inputModalities?.includes("image")
            ? await resolveEditDimensionsForImage(parsedParams)
            : parsedParams;
    const pricingDimensions =
        c.var.model.resolved === "nova-canvas"
            ? clampNovaCanvasDimensions(safeParams.width, safeParams.height)
            : safeParams;
    c.var.track.setPricingInput({
        resolution: safeParams.resolution,
        quality: safeParams.quality,
        hasImage: (safeParams.image?.length ?? 0) > 0,
        hasReferenceVideo: (safeParams.reference_videos?.length ?? 0) > 0,
        maxImageDimension: Math.max(
            pricingDimensions.width,
            pricingDimensions.height,
        ),
        megapixels: (safeParams.width * safeParams.height) / 1_000_000,
    });

    try {
        const { result, params, servedIndex } = await generateMediaWithFallback(
            c,
            originalPrompt,
            safeParams,
        );
        const headers = mediaHeaders(
            originalPrompt,
            params,
            result,
            result.mimeType || detectMimeType(result.buffer),
        );
        if (servedIndex > 0) {
            // Same shape text emits, so tracking has one fallback marker.
            headers.set(
                FALLBACK_TARGET_HEADER,
                formatFallbackTarget(servedIndex),
            );
        }
        return new Response(bufferToUint8Array(result.buffer), { headers });
    } catch (error) {
        throwImageError(error);
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
