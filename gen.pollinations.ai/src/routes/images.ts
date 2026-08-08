/**
 * OpenAI-compatible image generation and editing route handlers.
 * POST /v1/images/generations — generate images from text prompts
 * POST /v1/images/edits — edit images with text prompts + source images
 */

import { UpstreamError } from "@shared/error.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    type OpenAIImageUsage,
    parseUsageHeaders,
    usageToOpenAIImageUsage,
} from "@shared/registry/usage-headers.ts";
import {
    type CreateImageEditRequest,
    CreateImageEditRequestSchema,
    type CreateImageRequest,
} from "@shared/schemas/openai.ts";
import { normalizeSafeValue, type SafeValue } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { generateImageOrVideoResponse } from "@/image/handler.ts";
import { getSourceImageDimensions } from "@/image/utils/imageDownload.ts";
import { applySafety, withSafetyHeaders } from "@/middleware/safety.ts";
import { arrayBufferToBase64 } from "@/util.ts";
import { requireGenerationAccess } from "@/utils/generation-access.ts";

// --- Helpers ---

const QUALITY_MAP: Record<string, string> = { standard: "medium", hd: "high" };
const PASSTHROUGH_PARAMS = ["safe", "transparent", "guidance_scale"] as const;

function imageResponse(
    data: { url?: string; b64_json?: string; media_type?: string },
    prompt: string,
    usage: OpenAIImageUsage,
) {
    return {
        created: Math.floor(Date.now() / 1000),
        data: [{ ...data, revised_prompt: prompt }],
        usage,
    };
}

function responseImageUsage(
    c: Context<Env>,
    response: Response,
): OpenAIImageUsage {
    const usage = parseUsageHeaders(response.headers);
    const modelUsed = response.headers.get("x-model-used");
    if (!modelUsed) throw new Error("Image response is missing x-model-used");

    for (const [name, value] of Object.entries(
        buildUsageHeaders(modelUsed, usage),
    )) {
        c.header(name, value);
    }
    // Tracking reads this off the final response, and these routes replace the
    // generated response with JSON — so without carrying it over, a rescue on
    // /v1/images/* records fallback_used = false.
    const fallbackTarget = response.headers.get(FALLBACK_TARGET_HEADER);
    if (fallbackTarget) c.header(FALLBACK_TARGET_HEADER, fallbackTarget);
    return usageToOpenAIImageUsage(usage);
}

/** Resolve OpenAI params to Pollinations equivalents. */
function resolveParams(opts: {
    size?: string;
    quality?: string;
    seed?: number;
}): {
    width?: number;
    height?: number;
    quality: string;
    seed: number;
} {
    // Width/height are only emitted when the caller actually passed `size`.
    // Leaving them undefined lets the image-param schema fill model-specific
    // defaults AND preserves the dimensionsExplicit signal seedream-4 needs.
    const sizeDims = opts.size
        ? opts.size.split("x").map((s) => Number.parseInt(s, 10))
        : undefined;
    const width = sizeDims?.[0];
    const height = sizeDims?.[1];
    return {
        ...(Number.isInteger(width) ? { width } : {}),
        ...(Number.isInteger(height) ? { height } : {}),
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
    safe?: SafeValue;
    extra: Record<string, unknown>;
}> {
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
        let formData: FormData;
        try {
            formData = c.get("formData") || (await c.req.formData());
        } catch {
            throw new UpstreamError(400 as ContentfulStatusCode, {
                message: "Invalid multipart form data",
            });
        }
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
                const base64 = arrayBufferToBase64(await entry.arrayBuffer());
                imageUrls.push(
                    `data:${entry.type || "image/png"};base64,${base64}`,
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
            safe: formData.get("safe") as string | null,
            extra: {
                ...(formData.has("safe")
                    ? { safe: formData.get("safe") as string }
                    : {}),
            },
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
        safe: body.safe as SafeValue,
        extra: passthrough,
    };
}

// --- Exported handlers ---

export async function handleImageGeneration(c: Context<Env>) {
    await requireGenerationAccess(c.var, c.env);

    const body = c.req.valid("json" as never) as CreateImageRequest &
        Record<string, unknown>;
    const model = c.var.model.resolved;
    if (body.response_format === "url" && c.var.model.communityEndpoint) {
        throw new UpstreamError(400 as ContentfulStatusCode, {
            message:
                'Community image models support response_format "b64_json" only',
        });
    }
    const resolved = resolveParams(body);
    const safePrompt = await applySafety(
        c,
        body.prompt,
        body.safe as SafeValue,
    );

    const response = await generateImageOrVideoResponse(c, safePrompt, {
        ...body,
        prompt: safePrompt,
        ...collectPassthrough(body, "image"),
        ...resolved,
        model,
    });
    c.var.track.overrideResponseTracking(response.clone());
    const usage = responseImageUsage(c, response);
    const mediaType = response.headers.get("content-type") || undefined;
    const mediaData =
        mediaType === "image/svg+xml" ? { media_type: mediaType } : {};

    if (body.response_format === "url") {
        const origin = getPublicOrigin(c);
        const imageUrl = new URL(
            `${origin}/image/${encodeURIComponent(safePrompt)}`,
        );
        for (const [key, value] of Object.entries({
            model,
            ...resolved,
        }))
            imageUrl.searchParams.set(key, String(value));
        if (typeof body.resolution === "string") {
            imageUrl.searchParams.set("resolution", body.resolution);
        }
        const safeValue = normalizeSafeValue(body.safe as SafeValue);
        if (safeValue) {
            imageUrl.searchParams.set("safe", safeValue);
        }
        await response.arrayBuffer();
        return withSafetyHeaders(
            c,
            c.json(
                imageResponse(
                    { url: imageUrl.toString(), ...mediaData },
                    safePrompt,
                    usage,
                ),
            ),
        );
    }

    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return withSafetyHeaders(
        c,
        c.json(
            imageResponse(
                { b64_json: base64, ...mediaData },
                safePrompt,
                usage,
            ),
        ),
    );
}

function computeAspectRatioSize(
    width: number,
    height: number,
    maxPixels: number = 1048576,
): string {
    const area = width * height;
    let w: number;
    let h: number;
    if (area <= maxPixels) {
        w = width;
        h = height;
    } else {
        const scale = Math.sqrt(maxPixels / area);
        w = Math.round(width * scale);
        h = Math.round(height * scale);
    }
    const snap = (v: number) => Math.max(16, Math.round(v / 16) * 16);
    return `${snap(w)}x${snap(h)}`;
}

export async function handleImageEdit(c: Context<Env>) {
    await requireGenerationAccess(c.var, c.env);

    const { prompt, imageUrls, size, quality, seed, safe, extra } =
        await parseEditInput(c);

    let effectiveSize = size;
    if (!effectiveSize && imageUrls.length > 0) {
        const dims = await getSourceImageDimensions(imageUrls[0]);
        if (dims) {
            effectiveSize = computeAspectRatioSize(dims.width, dims.height);
        }
    }

    const safePrompt = await applySafety(c, prompt, safe);
    const resolved = resolveParams({ size: effectiveSize, quality, seed });

    const response = await generateImageOrVideoResponse(c, safePrompt, {
        prompt: safePrompt,
        image: imageUrls,
        ...extra,
        ...resolved,
        model: c.var.model.resolved,
    });
    c.var.track.overrideResponseTracking(response.clone());
    const usage = responseImageUsage(c, response);
    const mediaType = response.headers.get("content-type") || undefined;

    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return withSafetyHeaders(
        c,
        c.json(
            imageResponse(
                {
                    b64_json: base64,
                    ...(mediaType === "image/svg+xml"
                        ? { media_type: mediaType }
                        : {}),
                },
                safePrompt,
                usage,
            ),
        ),
    );
}
