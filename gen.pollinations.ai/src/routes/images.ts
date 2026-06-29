/**
 * OpenAI-compatible image generation and editing route handlers.
 * POST /v1/images/generations — generate images from text prompts
 * POST /v1/images/edits — edit images with text prompts + source images
 */

import { UpstreamError } from "@shared/error.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
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
import { applySafety, withSafetyHeaders } from "@/middleware/safety.ts";
import { arrayBufferToBase64, randomSeed } from "@/util.ts";
import { requireGenerationAccess } from "@/utils/generation-access.ts";

// --- Helpers ---

const QUALITY_MAP: Record<string, string> = { standard: "medium", hd: "high" };
const PASSTHROUGH_PARAMS = ["safe", "transparent", "guidance_scale"] as const;

function imageResponse(
    data: { url?: string; b64_json?: string },
    prompt: string,
) {
    return {
        created: Math.floor(Date.now() / 1000),
        data: [{ ...data, revised_prompt: prompt }],
    };
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
        seed: opts.seed ?? randomSeed(),
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
        const safeValue = normalizeSafeValue(body.safe as SafeValue);
        if (safeValue) {
            imageUrl.searchParams.set("safe", safeValue);
        }
        await response.arrayBuffer();
        return withSafetyHeaders(
            c,
            c.json(imageResponse({ url: imageUrl.toString() }, safePrompt)),
        );
    }

    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return withSafetyHeaders(
        c,
        c.json(imageResponse({ b64_json: base64 }, safePrompt)),
    );
}

export async function handleImageEdit(c: Context<Env>) {
    await requireGenerationAccess(c.var, c.env);

    const { prompt, imageUrls, size, quality, seed, safe, extra } =
        await parseEditInput(c);
    const safePrompt = await applySafety(c, prompt, safe);
    const resolved = resolveParams({ size, quality, seed });

    const response = await generateImageOrVideoResponse(c, safePrompt, {
        prompt: safePrompt,
        image: imageUrls,
        ...extra,
        ...resolved,
        model: c.var.model.resolved,
    });
    c.var.track.overrideResponseTracking(response.clone());

    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return withSafetyHeaders(
        c,
        c.json(imageResponse({ b64_json: base64 }, safePrompt)),
    );
}
