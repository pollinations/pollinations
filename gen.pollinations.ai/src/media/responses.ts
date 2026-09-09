import type { SafeValue } from "@shared/schemas/safety.ts";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { normalizedJsonBody } from "@/middleware/generation-cache.ts";
import { deduplicateGeneration } from "@/middleware/generation-deduplication.ts";
import {
    audioCache,
    imageCache,
    model3dCache,
} from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
import { applySafetyToInput } from "@/middleware/safety.ts";
import { track } from "@/middleware/track.ts";
import {
    responsesToChatCompletion,
    responsesToChatStream,
} from "@/text/responses/chatResponse.ts";
import { generationAccess } from "@/utils/generation-access.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import { mediaPromptRoute } from "./prompt-route.ts";
import { createMediaResponse, mediaResponseStream } from "./response-output.ts";

type MediaProtocol = "responses" | "chat/completions";

type MediaInput = { prompt: string; images: string[] };

/** Chat `image_url` and Responses `input_image` parts, as URLs or data URIs. */
function imagePart(part: { type?: unknown; image_url?: unknown }) {
    if (part.type !== "image_url" && part.type !== "input_image") return;
    const url =
        typeof part.image_url === "string"
            ? part.image_url
            : (part.image_url as { url?: unknown } | undefined)?.url;
    return typeof url === "string" ? url : undefined;
}

/** Earlier conversation is context for text models, not a media prompt. */
export function mediaPrompt(input: unknown): MediaInput {
    let content: unknown = input;
    const images: string[] = [];
    if (Array.isArray(input)) {
        content = input.findLast((item) => item?.role === "user")?.content;
    }
    if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const part of content) {
            const image = part && imagePart(part);
            if (image) {
                images.push(image);
            } else if (
                part &&
                ["text", "input_text"].includes(part.type) &&
                typeof part.text === "string"
            ) {
                texts.push(part.text);
            } else {
                throw new HTTPException(400, {
                    message:
                        "Media generation accepts text and image parts only; use the native media endpoints for other attachments.",
                });
            }
        }
        content = texts.join("\n");
    }
    if (typeof content !== "string" || !content.trim()) {
        throw new HTTPException(400, {
            message: "Media generation requires text in the last user message.",
        });
    }
    if (!content.isWellFormed()) {
        throw new HTTPException(400, {
            message: "Media prompt contains invalid Unicode.",
        });
    }
    // URL normalization would remove these native-route path segments.
    if (content === "." || content === "..") {
        throw new HTTPException(400, {
            message: "Media prompt cannot be only '.' or '..'.",
        });
    }
    return { prompt: content, images };
}

/** Generate through the native durable pipeline, then only change presentation. */
export function mediaResponses(protocol: MediaProtocol) {
    return createMiddleware<Env>(async (c, next) => {
        const body = c.req.valid("json" as never) as Record<string, unknown>;
        const registry = await getGenerationModelRegistry(c.env);
        const entry =
            typeof body.model === "string"
                ? registry.resolve(body.model)
                : null;
        const route = entry && mediaPromptRoute(entry);
        if (!entry || !route) return next();

        const cache =
            entry.definition.category === "audio"
                ? audioCache
                : entry.definition.category === "3d"
                  ? model3dCache
                  : imageCache;
        await every(
            resolveModel(entry.eventType, {
                supportedEndpoint: `/v1/${protocol}`,
            }),
            track(entry.eventType),
            createMiddleware<Env>(async (ctx, proceed) => {
                const { prompt, images } = mediaPrompt(
                    protocol === "responses" ? body.input : body.messages,
                );
                // The provider is not a text stream; only the final wrapper is.
                ctx.var.track.streamRequested = false;
                if (images.length === 0) {
                    const url = new URL(
                        `${route}${encodeURIComponent(prompt)}`,
                        ctx.req.url,
                    );
                    url.searchParams.set("model", entry.id);
                    if (body.safe !== undefined)
                        url.searchParams.set("safe", String(body.safe));
                    ctx.set("generationRequestUrl", url);
                    ctx.set("generationRequestMethod", "GET");
                    return proceed();
                }
                if (
                    entry.definition.category !== "image" ||
                    !entry.definition.inputModalities?.includes("image")
                )
                    throw new HTTPException(400, {
                        message: `Model "${entry.id}" does not accept image input.`,
                    });
                // Replay the JSON edits contract: the executor parses it as
                // already-safe, and data URIs are hashed into the cache key.
                const safe = body.safe as SafeValue;
                const edit = normalizedJsonBody(
                    JSON.stringify({
                        prompt: await applySafetyToInput(ctx, prompt, safe),
                        model: entry.id,
                        image: images.map((image_url) => ({ image_url })),
                        ...(safe !== undefined && { safe }),
                    }),
                );
                ctx.set("generationRequestBody", edit);
                ctx.set("generationCacheBody", edit);
                ctx.set("generationRequestContentType", "application/json");
                ctx.set(
                    "generationRequestUrl",
                    new URL("/v1/images/edits", ctx.req.url),
                );
                ctx.set("generationRequestMethod", "POST");
                await proceed();
            }),
            cache,
            generationAccess,
            deduplicateGeneration,
        )(c, async () => {
            throw new Error(
                "Media generation must finish in the durable executor",
            );
        });

        const media = c.res;
        if (!media.ok) return media;
        const mediaUrl = media.headers
            .get("Link")
            ?.match(/^<([^>]+)>; rel="enclosure"$/)?.[1];
        if (!mediaUrl)
            throw new HTTPException(502, {
                message: "Media generation returned no public file URL",
            });
        // The file is already stored; this response only needs its URL.
        await media.body?.cancel();
        const response = createMediaResponse(
            entry.id,
            mediaUrl,
            media.headers.get("content-type") ?? "",
        );
        // Hono preserves the previous response's headers when replacing it.
        const headers = media.headers;
        for (const name of [
            "content-length",
            "content-disposition",
            "content-encoding",
        ])
            headers.delete(name);
        // The file is immutable, not the per-request protocol envelope.
        headers.set("Cache-Control", "no-cache");
        if (body.stream === true) {
            const stream = mediaResponseStream(response);
            headers.set("Content-Type", "text/event-stream; charset=utf-8");
            c.res = new Response(
                protocol === "responses"
                    ? stream
                    : responsesToChatStream(stream, entry.id, {
                          requireUsage: false,
                      }),
                { headers },
            );
            return;
        }
        headers.set("Content-Type", "application/json; charset=utf-8");
        c.res = Response.json(
            protocol === "responses"
                ? response
                : responsesToChatCompletion(
                      response,
                      entry.id,
                      new URL(c.req.url),
                      { requireUsage: false },
                  ),
            { headers },
        );
    });
}
