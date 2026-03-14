/**
 * OpenAI-compatible image generation and editing route handlers.
 * POST /v1/images/generations — generate images from text prompts
 * POST /v1/images/edits — edit images with text prompts + source images
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getDefaultErrorMessage, UpstreamError } from "@/error.ts";
import {
    type CreateImageEditRequest,
    CreateImageEditRequestSchema,
    type CreateImageRequest,
} from "@/schemas/openai.ts";

// --- Helpers ---

const QUALITY_MAP: Record<string, string> = { standard: "medium", hd: "high" };
const PASSTHROUGH_PARAMS = [
    "nologo",
    "enhance",
    "safe",
    "private",
    "transparent",
    "negative_prompt",
    "guidance_scale",
] as const;

function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function imageResponse(
    data: { url?: string; b64_json?: string },
    prompt: string,
) {
    return {
        created: Math.floor(Date.now() / 1000),
        data: [{ ...data, revised_prompt: prompt }],
    };
}

/** Auth + balance checks shared by both handlers. */
async function requireAuthAndBalance(
    c: Context,
    checkBalance: (vars: unknown) => Promise<void>,
) {
    await c.var.auth.requireAuthorization();
    c.var.auth.requireModelAccess();
    c.var.auth.requireKeyBudget();
    await checkBalance(c.var);
}

/** Build image service URL with core params (kept in URL for caching/logging). */
function imageServiceUrl(
    baseUrl: string,
    p: {
        model: string;
        width: number;
        height: number;
        quality: string;
        seed: number;
    },
): URL {
    const u = new URL(`${baseUrl}/prompt/`);
    for (const [k, v] of Object.entries({ ...p, nofeed: "true" }))
        u.searchParams.set(k, String(v));
    return u;
}

/** POST to image service, throw on error. */
async function postToImageService(
    url: URL,
    c: Context,
    body: Record<string, unknown>,
    proxyHeaders: (c: Context) => Record<string, string>,
): Promise<Response> {
    const response = await fetch(url.toString(), {
        method: "POST",
        headers: { ...proxyHeaders(c), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new UpstreamError(response.status as ContentfulStatusCode, {
            message: text || getDefaultErrorMessage(response.status),
            requestUrl: url,
        });
    }
    return response;
}

/** Resolve OpenAI params to Pollinations equivalents. */
function resolveParams(opts: {
    size?: string;
    quality?: string;
    seed?: number;
}) {
    const [w, h] = (opts.size || "1024x1024")
        .split("x")
        .map((s) => Number.parseInt(s, 10));
    return {
        width: w || 1024,
        height: h || 1024,
        quality: QUALITY_MAP[opts.quality || ""] || opts.quality || "medium",
        seed: opts.seed ?? Math.floor(Math.random() * 2147483647),
    };
}

/** Collect passthrough params from request body. */
function collectPassthrough(
    body: Record<string, unknown>,
    ...extraKeys: string[]
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of [...PASSTHROUGH_PARAMS, ...extraKeys]) {
        if (body[key] !== undefined) result[key] = body[key];
    }
    return result;
}

/** Parse edits input from multipart or JSON. */
async function parseEditInput(c: Context): Promise<{
    prompt: string;
    imageUrls: string[];
    size?: string;
    quality?: string;
    seed?: number;
    extra: Record<string, unknown>;
}> {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
        const formData = c.get("formData") || (await c.req.formData());
        const prompt = formData.get("prompt") as string;
        if (!prompt)
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Missing required field: prompt",
            });

        const imageUrls: string[] = [];
        for (const entry of [
            ...(formData.getAll("image") as (File | string)[]),
            ...(formData.getAll("image[]") as (File | string)[]),
        ]) {
            if (typeof entry === "string") {
                imageUrls.push(entry);
            } else if (entry instanceof File) {
                const b64 = arrayBufferToBase64(await entry.arrayBuffer());
                imageUrls.push(
                    `data:${entry.type || "image/png"};base64,${b64}`,
                );
            }
        }
        if (!imageUrls.length)
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Missing required field: image",
            });

        return {
            prompt,
            imageUrls,
            size: (formData.get("size") as string) || undefined,
            quality: (formData.get("quality") as string) || undefined,
            extra: {},
        };
    }

    // JSON body
    const body = (await c.req.json()) as CreateImageEditRequest &
        Record<string, unknown>;
    const parsed = CreateImageEditRequestSchema.safeParse(body);
    if (!parsed.success)
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: parsed.error.issues.map((i) => i.message).join(", "),
        });

    const imageUrls =
        typeof parsed.data.image === "string"
            ? [parsed.data.image]
            : parsed.data.image.map((i) => i.image_url);
    if (!imageUrls.length)
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message: "Missing required field: image",
        });

    const extra = collectPassthrough(body, "seed");
    const { seed, ...passthrough } = extra as { seed?: number } & Record<
        string,
        unknown
    >;
    return {
        prompt: parsed.data.prompt,
        imageUrls,
        size: parsed.data.size,
        quality: parsed.data.quality,
        seed,
        extra: passthrough,
    };
}

// --- Exported handlers ---

export function handleImageGeneration(
    checkBalance: (vars: unknown) => Promise<void>,
    proxyHeaders: (c: Context) => Record<string, string>,
) {
    return async (c: Context) => {
        await requireAuthAndBalance(c, checkBalance);

        const body = (await c.req.json()) as CreateImageRequest &
            Record<string, unknown>;
        const resolved = resolveParams(body);

        const url = imageServiceUrl(c.env.IMAGE_SERVICE_URL, {
            model: c.var.model.resolved,
            ...resolved,
        });
        const postBody = {
            prompt: body.prompt,
            ...collectPassthrough(body, "image"),
        };

        const response = await postToImageService(
            url,
            c,
            postBody,
            proxyHeaders,
        );
        c.var.track.overrideResponseTracking(response.clone());

        if (body.response_format === "url") {
            const imageUrl = new URL(
                `https://gen.pollinations.ai/image/${encodeURIComponent(body.prompt)}`,
            );
            for (const [k, v] of Object.entries({
                model: c.var.model.resolved,
                ...resolved,
                nologo: "true",
            }))
                imageUrl.searchParams.set(k, String(v));
            await response.arrayBuffer();
            return c.json(
                imageResponse({ url: imageUrl.toString() }, body.prompt),
            );
        }

        const b64 = arrayBufferToBase64(await response.arrayBuffer());
        return c.json(imageResponse({ b64_json: b64 }, body.prompt));
    };
}

export function handleImageEdit(
    checkBalance: (vars: unknown) => Promise<void>,
    proxyHeaders: (c: Context) => Record<string, string>,
) {
    return async (c: Context) => {
        await requireAuthAndBalance(c, checkBalance);

        const { prompt, imageUrls, size, quality, seed, extra } =
            await parseEditInput(c);
        const resolved = resolveParams({ size, quality, seed });

        const url = imageServiceUrl(c.env.IMAGE_SERVICE_URL, {
            model: c.var.model.resolved,
            ...resolved,
        });

        const response = await postToImageService(
            url,
            c,
            { prompt, image: imageUrls, ...extra },
            proxyHeaders,
        );
        c.var.track.overrideResponseTracking(response.clone());

        const b64 = arrayBufferToBase64(await response.arrayBuffer());
        return c.json(imageResponse({ b64_json: b64 }, prompt));
    };
}
