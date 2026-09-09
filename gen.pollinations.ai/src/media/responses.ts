import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { deduplicateGeneration } from "@/middleware/generation-deduplication.ts";
import {
    audioCache,
    imageCache,
    model3dCache,
} from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
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

/** Earlier conversation is context for text models, not a media prompt. */
export function mediaPrompt(input: unknown): string {
    let content: unknown = input;
    if (Array.isArray(input)) {
        content = input.findLast((item) => item?.role === "user")?.content;
    }
    if (Array.isArray(content)) {
        if (
            content.some(
                (part) =>
                    !part ||
                    !["text", "input_text"].includes(part.type) ||
                    typeof part.text !== "string",
            )
        ) {
            throw new HTTPException(400, {
                message:
                    "Media generation accepts text only; use the native media endpoints for attachments.",
            });
        }
        content = content.map((part) => part.text).join("\n");
    }
    if (typeof content !== "string" || !content.trim()) {
        throw new HTTPException(400, {
            message: "Media generation requires text in the last user message.",
        });
    }
    return content;
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
                const prompt = mediaPrompt(
                    protocol === "responses" ? body.input : body.messages,
                );
                const url = new URL(
                    `${route}${encodeURIComponent(prompt)}`,
                    ctx.req.url,
                );
                url.searchParams.set("model", entry.id);
                if (body.safe !== undefined)
                    url.searchParams.set("safe", String(body.safe));
                ctx.set("generationRequestUrl", url);
                ctx.set("generationRequestMethod", "GET");
                // The provider is not a text stream; only the final wrapper is.
                ctx.var.track.streamRequested = false;
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
        await media.body?.pipeTo(new WritableStream());
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
