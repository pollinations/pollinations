/**
 * OpenAI-compatible image generation and editing route handlers.
 * POST /v1/images/generations — generate images from text prompts
 * POST /v1/images/edits — edit images with text prompts + source images
 */

import type { Logger } from "@logtape/logtape";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import {
    type CreateImageEditRequest,
    CreateImageEditRequestSchema,
    type CreateImageRequest,
} from "@/schemas/openai.ts";

// --- Shared helpers ---

/** Convert an ArrayBuffer to a base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binaryStr = "";
    for (let i = 0; i < bytes.length; i++) {
        binaryStr += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryStr);
}

/** Parse "WIDTHxHEIGHT" into [width, height], defaulting to 1024x1024. */
function parseImageSize(size: string | undefined): [number, number] {
    const [w, h] = (size || "1024x1024")
        .split("x")
        .map((s) => Number.parseInt(s, 10));
    return [w || 1024, h || 1024];
}

/** Map OpenAI quality values ("standard", "hd") to Pollinations equivalents. */
const QUALITY_MAP: Record<string, string> = { standard: "medium", hd: "high" };
function resolveImageQuality(quality: string | undefined): string {
    return QUALITY_MAP[quality || ""] || quality || "medium";
}

/** Generate a random seed if none is provided. */
function resolveImageSeed(seed: number | undefined): number {
    return seed ?? Math.floor(Math.random() * 2147483647);
}

/** Pollinations-specific params that can be forwarded to the image service. */
const IMAGE_PASSTHROUGH_PARAMS = [
    "nologo",
    "enhance",
    "safe",
    "private",
    "transparent",
    "negative_prompt",
    "guidance_scale",
] as const;

/** Build the target URL for the image service (core params in URL for caching). */
function buildImageServiceUrl(
    baseUrl: string,
    params: {
        model: string;
        width: number;
        height: number;
        quality: string;
        seed: number;
    },
): URL {
    const targetUrl = new URL(`${baseUrl}/prompt/`);
    targetUrl.searchParams.set("model", params.model);
    targetUrl.searchParams.set("width", String(params.width));
    targetUrl.searchParams.set("height", String(params.height));
    targetUrl.searchParams.set("quality", params.quality);
    targetUrl.searchParams.set("seed", String(params.seed));
    targetUrl.searchParams.set("nofeed", "true");
    return targetUrl;
}

/** Fetch from the image service, POST body with prompt/image/params. */
export async function fetchImageService(
    targetUrl: URL,
    c: Context,
    log: Pick<Logger, "debug" | "warn">,
    body: Record<string, unknown>,
    proxyHeaders: (c: Context) => Record<string, string>,
): Promise<Response> {
    log.debug("Proxying to image service: {url}", {
        url: targetUrl.toString(),
    });

    const response = await fetch(targetUrl.toString(), {
        method: "POST",
        headers: { ...proxyHeaders(c), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const responseText = await response.text();
        log.warn("Image service error {status}: {body}", {
            status: response.status,
            body: responseText,
        });
        throw new UpstreamError(response.status as ContentfulStatusCode, {
            message: responseText || getDefaultErrorMessage(response.status),
            requestUrl: targetUrl,
        });
    }

    return response;
}

/** Build a standard OpenAI image response with a single b64_json entry. */
function imageResponseB64(base64: string, prompt: string) {
    return {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: base64, revised_prompt: prompt }],
    };
}

/** Build a standard OpenAI image response with a URL entry. */
function imageResponseUrl(url: string, prompt: string) {
    return {
        created: Math.floor(Date.now() / 1000),
        data: [{ url, revised_prompt: prompt }],
    };
}

/** Parse image edit input from either multipart/form-data or JSON body. */
async function parseImageEditInput(c: Context): Promise<{
    prompt: string;
    imageUrls: string[];
    size: string | undefined;
    quality: string | undefined;
    seed: number | undefined;
    extra: Record<string, unknown>;
}> {
    const contentType = c.req.header("content-type") || "";
    const extra: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
        const formData = c.get("formData") || (await c.req.formData());
        const prompt = formData.get("prompt") as string;
        if (!prompt) {
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Missing required field: prompt",
            });
        }

        const imageUrls: string[] = [];
        const allImages = [
            ...(formData.getAll("image") as (File | string)[]),
            ...(formData.getAll("image[]") as (File | string)[]),
        ];

        for (const entry of allImages) {
            if (typeof entry === "string") {
                imageUrls.push(entry);
            } else if (entry instanceof File) {
                const base64 = arrayBufferToBase64(await entry.arrayBuffer());
                const mime = entry.type || "image/png";
                imageUrls.push(`data:${mime};base64,${base64}`);
            }
        }

        if (imageUrls.length === 0) {
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Missing required field: image",
            });
        }

        return {
            prompt,
            imageUrls,
            size: (formData.get("size") as string) || undefined,
            quality: (formData.get("quality") as string) || undefined,
            seed: undefined,
            extra,
        };
    }

    // JSON body
    const body = (await c.req.json()) as CreateImageEditRequest &
        Record<string, unknown>;
    const parsed = CreateImageEditRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: parsed.error.issues.map((i) => i.message).join(", "),
        });
    }

    const imageUrls =
        typeof parsed.data.image === "string"
            ? [parsed.data.image]
            : parsed.data.image.map((i) => i.image_url);

    if (imageUrls.length === 0) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Missing required field: image",
        });
    }

    for (const key of ["seed", ...IMAGE_PASSTHROUGH_PARAMS] as const) {
        if (body[key] !== undefined) extra[key] = body[key];
    }

    return {
        prompt: parsed.data.prompt,
        imageUrls,
        size: parsed.data.size,
        quality: parsed.data.quality,
        seed: extra.seed as number | undefined,
        extra,
    };
}

// --- Route handler functions (called from proxy.ts) ---

// biome-ignore lint/suspicious/noExplicitAny: accepts any context variables shape from proxy.ts
type CheckBalance = (vars: any) => Promise<void>;

/** Handler for POST /v1/images/generations */
export function handleImageGeneration(
    checkBalance: CheckBalance,
    proxyHeadersFn: (c: Context) => Record<string, string>,
) {
    return async (c: Context) => {
        const log = c.get("log").getChild("generate");
        await c.var.auth.requireAuthorization();
        c.var.auth.requireModelAccess();
        c.var.auth.requireKeyBudget();
        await checkBalance(c.var);

        const body = (await c.req.json()) as CreateImageRequest &
            Record<string, unknown>;
        const model = c.var.model.resolved;
        const [width, height] = parseImageSize(body.size);
        const quality = resolveImageQuality(body.quality);
        const seed = resolveImageSeed(body.seed as number | undefined);

        const postBody: Record<string, unknown> = { prompt: body.prompt };
        for (const key of [...IMAGE_PASSTHROUGH_PARAMS, "image"] as const) {
            if (body[key] !== undefined) postBody[key] = body[key];
        }

        const targetUrl = buildImageServiceUrl(c.env.IMAGE_SERVICE_URL, {
            model,
            width,
            height,
            quality,
            seed,
        });

        const response = await fetchImageService(
            targetUrl,
            c,
            log,
            postBody,
            proxyHeadersFn,
        );
        c.var.track.overrideResponseTracking(response.clone());

        if (body.response_format === "url") {
            const imageUrl = new URL(
                `https://gen.pollinations.ai/image/${encodeURIComponent(body.prompt)}`,
            );
            imageUrl.searchParams.set("model", model);
            imageUrl.searchParams.set("width", String(width));
            imageUrl.searchParams.set("height", String(height));
            imageUrl.searchParams.set("quality", quality);
            imageUrl.searchParams.set("seed", String(seed));
            imageUrl.searchParams.set("nologo", "true");
            await response.arrayBuffer();
            return c.json(imageResponseUrl(imageUrl.toString(), body.prompt));
        }

        const base64 = arrayBufferToBase64(await response.arrayBuffer());
        return c.json(imageResponseB64(base64, body.prompt));
    };
}

/** Handler for POST /v1/images/edits */
export function handleImageEdit(
    checkBalance: CheckBalance,
    proxyHeadersFn: (c: Context) => Record<string, string>,
) {
    return async (c: Context) => {
        const log = c.get("log").getChild("generate");
        await c.var.auth.requireAuthorization();
        c.var.auth.requireModelAccess();
        c.var.auth.requireKeyBudget();
        await checkBalance(c.var);

        const { prompt, imageUrls, size, quality, seed, extra } =
            await parseImageEditInput(c);

        const [width, height] = parseImageSize(size);
        const resolvedQuality = resolveImageQuality(quality);
        const resolvedSeed = resolveImageSeed(seed);

        const targetUrl = buildImageServiceUrl(c.env.IMAGE_SERVICE_URL, {
            model: c.var.model.resolved,
            width,
            height,
            quality: resolvedQuality,
            seed: resolvedSeed,
        });

        const postBody: Record<string, unknown> = {
            prompt,
            image: imageUrls,
            ...extra,
        };

        const response = await fetchImageService(
            targetUrl,
            c,
            log,
            postBody,
            proxyHeadersFn,
        );
        c.var.track.overrideResponseTracking(response.clone());

        const base64 = arrayBufferToBase64(await response.arrayBuffer());
        return c.json(imageResponseB64(base64, prompt));
    };
}
