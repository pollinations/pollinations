import { createMiddleware } from "hono/factory";
import type { Env } from "@/env.ts";
import { normalizedJsonBody } from "@/middleware/generation-cache.ts";
import {
    chatStreamToMessages,
    chatToMessagesResponse,
    type MessagesRequest,
    MessagesRequestError,
    messagesError,
    messagesToChatRequest,
} from "./translate.ts";

const MESSAGES_PATH = "/v1/messages";

// Hono's res setter copies the previous response's headers (including a now
// wrong content-length) onto the new one; clear it first.
function replaceResponse(
    c: { res: Response | undefined },
    body: BodyInit,
    init: { status: number; headers: Headers },
) {
    init.headers.delete("content-length");
    c.res = undefined;
    c.res = new Response(body, init);
}

/**
 * Rewrites gen's JSON errors into Anthropic's error shape so SDK retries and
 * Claude Code's error handling work. Registered before auth so 401, 402 and
 * 429 from shared middleware are covered too.
 */
export const messagesErrors = createMiddleware<Env>(async (c, next) => {
    await next();
    if (c.req.path !== MESSAGES_PATH || c.res.status < 400) return;
    if (!c.res.headers.get("content-type")?.includes("application/json"))
        return;
    const body = (await c.res
        .clone()
        .json()
        .catch(() => null)) as {
        error?: { message?: string } | string;
        message?: string;
    } | null;
    const message =
        (typeof body?.error === "object" ? body.error.message : body?.error) ??
        body?.message ??
        "Request failed";
    replaceResponse(c, JSON.stringify(messagesError(c.res.status, message)), {
        status: c.res.status,
        headers: new Headers(c.res.headers),
    });
});

/**
 * Serves /v1/messages through the Chat Completions pipeline: the Chat request
 * is what gets validated, cached, coordinated and billed, and only the final
 * response is re-encoded as Anthropic Messages.
 */
export const messagesToChat = createMiddleware<Env>(async (c, next) => {
    const request = c.req.valid("json" as never) as MessagesRequest;
    let chat: ReturnType<typeof messagesToChatRequest>;
    try {
        chat = messagesToChatRequest(request);
    } catch (error) {
        if (!(error instanceof MessagesRequestError)) throw error;
        return c.json(messagesError(400, error.message), 400);
    }
    const body = JSON.stringify(chat);
    c.req.addValidatedData("json", chat);
    // The durable executor replays this Chat request on the Chat route.
    c.set("generationRequestUrl", new URL("/v1/chat/completions", c.req.url));
    c.set("generationRequestBody", body);
    c.set("generationCacheBody", normalizedJsonBody(body));

    await next();

    const res = c.res;
    if (!res.ok || !res.body) return;
    const headers = new Headers(res.headers);
    if (res.headers.get("content-type")?.includes("text/event-stream")) {
        replaceResponse(c, chatStreamToMessages(res.body, chat.model), {
            status: res.status,
            headers,
        });
        return;
    }
    headers.set("content-type", "application/json; charset=utf-8");
    replaceResponse(
        c,
        JSON.stringify(chatToMessagesResponse(await res.json())),
        { status: res.status, headers },
    );
});
